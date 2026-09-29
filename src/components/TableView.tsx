import React, { useState } from 'react';
import { Track, PointStep, ClipSettings } from '../types';
import { Copy, Download, Trash2, Check, Shield, Clock } from 'lucide-react';
import { formatHighSpeedTime } from '../utils/highSpeedCameras';

interface TableViewProps {
  tracks: Track[];
  activeTrackId: string;
  currentFrame: number;
  clip?: ClipSettings;
  onSelectFrame: (frame: number) => void;
  onDeletePoint: (frame: number) => void;
}

export const TableView: React.FC<TableViewProps> = ({
  tracks,
  activeTrackId,
  currentFrame,
  clip,
  onSelectFrame,
  onDeletePoint,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'standard' | 'defense'>('defense'); // Default to defense for high-speed & ballistics
  const [tableTimeUnit, setTableTimeUnit] = useState<'auto' | 's' | 'ms' | 'us' | 'ns'>(clip?.timeUnit || 'auto');

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const steps = activeTrack ? activeTrack.steps : [];
  const fps = clip?.fps || 30;

  // Determine active display unit
  const effectiveUnit =
    tableTimeUnit === 'auto'
      ? fps >= 100000
        ? 'us'
        : fps >= 1000
        ? 'ms'
        : 's'
      : tableTimeUnit;

  const timeHeader = effectiveUnit === 'us' ? 't (µs)' : effectiveUnit === 'ms' ? 't (ms)' : 't (s)';

  const formatStepTime = (tSec: number): string => {
    if (effectiveUnit === 'us') {
      return (tSec * 1e6).toFixed(2);
    } else if (effectiveUnit === 'ms') {
      return (tSec * 1000).toFixed(3);
    } else {
      return tSec < 0.001 ? tSec.toExponential(4) : tSec.toFixed(5);
    }
  };

  const copyToClipboard = () => {
    if (steps.length === 0) return;
    const hasZ = steps.some((s) => s.z !== undefined);

    let headers: string[];
    let rows: string[][];

    if (viewMode === 'defense') {
      headers = [
        'Frame',
        timeHeader,
        't (s)',
        'x (m)',
        'y (m)',
        'z (m)',
        'SlantRange (m)',
        'Azimuth (°)',
        'Elevation (°)',
        'Speed (m/s)',
        'Mach',
        'G-Force',
        'a (m/s²)',
      ];
      rows = steps.map((s) => [
        s.frame.toString(),
        formatStepTime(s.time),
        s.time.toExponential(6),
        s.x.toFixed(4),
        s.y.toFixed(4),
        (s.z ?? 0).toFixed(4),
        (s.slantRange ?? Math.hypot(s.x, s.y, s.z ?? 0)).toFixed(4),
        (s.azimuthDeg ?? 0).toFixed(2),
        (s.elevationDeg ?? 0).toFixed(2),
        (s.v ?? 0).toFixed(3),
        (s.machNumber ?? 0).toFixed(3),
        (s.gForce ?? 0).toFixed(2),
        (s.a ?? 0).toFixed(3),
      ]);
    } else {
      headers = hasZ
        ? [
            'Frame',
            timeHeader,
            't (s)',
            'x (m)',
            'y (m)',
            'z (m)',
            'vx (m/s)',
            'vy (m/s)',
            'vz (m/s)',
            'v (m/s)',
            'ax (m/s²)',
            'ay (m/s²)',
            'az (m/s²)',
            'a (m/s²)',
            'KE (J)',
            'PE (J)',
          ]
        : [
            'Frame',
            timeHeader,
            't (s)',
            'x (m)',
            'y (m)',
            'vx (m/s)',
            'vy (m/s)',
            'v (m/s)',
            'ax (m/s²)',
            'ay (m/s²)',
            'a (m/s²)',
            'KE (J)',
            'PE (J)',
          ];

      rows = steps.map((s) => {
        const base = [
          s.frame.toString(),
          formatStepTime(s.time),
          s.time.toExponential(6),
          s.x.toFixed(4),
          s.y.toFixed(4),
        ];
        if (hasZ) {
          base.push((s.z ?? 0).toFixed(4));
        }
        base.push(s.vx?.toFixed(4) ?? '', s.vy?.toFixed(4) ?? '');
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
        return base;
      });
    }

    const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCSV = () => {
    if (steps.length === 0) return;
    const hasZ = steps.some((s) => s.z !== undefined);

    let headers: string[];
    let rows: string[][];

    if (viewMode === 'defense') {
      headers = [
        'Frame',
        `time_${effectiveUnit}`,
        'time_seconds',
        'x_m',
        'y_m',
        'z_m',
        'SlantRange_m',
        'Azimuth_deg',
        'Elevation_deg',
        'Speed_mps',
        'Mach_Number',
        'G_Force',
        'a_mps2',
      ];
      rows = steps.map((s) => [
        s.frame.toString(),
        formatStepTime(s.time),
        s.time.toExponential(6),
        s.x.toFixed(5),
        s.y.toFixed(5),
        (s.z ?? 0).toFixed(5),
        (s.slantRange ?? Math.hypot(s.x, s.y, s.z ?? 0)).toFixed(5),
        (s.azimuthDeg ?? 0).toFixed(3),
        (s.elevationDeg ?? 0).toFixed(3),
        (s.v ?? 0).toFixed(4),
        (s.machNumber ?? 0).toFixed(4),
        (s.gForce ?? 0).toFixed(3),
        (s.a ?? 0).toFixed(4),
      ]);
    } else {
      headers = hasZ
        ? [
            'Frame',
            `time_${effectiveUnit}`,
            'time_seconds',
            'x_m',
            'y_m',
            'z_m',
            'vx_mps',
            'vy_mps',
            'vz_mps',
            'v_mps',
            'ax_mps2',
            'ay_mps2',
            'az_mps2',
            'a_mps2',
            'KE_J',
            'PE_J',
          ]
        : [
            'Frame',
            `time_${effectiveUnit}`,
            'time_seconds',
            'x_m',
            'y_m',
            'vx_mps',
            'vy_mps',
            'v_mps',
            'ax_mps2',
            'ay_mps2',
            'a_mps2',
            'KE_J',
            'PE_J',
          ];

      rows = steps.map((s) => {
        const base = [
          s.frame.toString(),
          formatStepTime(s.time),
          s.time.toExponential(6),
          s.x.toFixed(5),
          s.y.toFixed(5),
        ];
        if (hasZ) {
          base.push((s.z ?? 0).toFixed(5));
        }
        base.push(s.vx?.toFixed(5) ?? '', s.vy?.toFixed(5) ?? '');
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
        return base;
      });
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${activeTrack?.name || 'tracker'}_${viewMode}_telemetry.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasZ = steps.some((s) => s.z !== undefined);

  return (
    <div id="table-view-container" className="flex flex-col h-full bg-white text-xs">
      {/* Table Toolbar */}
      <div className="bg-[#d4d0c8] border-b border-[#808080] px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-black flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-[#1e3a5f]" />
            <span>Data Table:</span>
          </span>

          {/* Mode Switcher */}
          <div className="flex items-center bg-[#efefef] border border-[#808080] rounded-[2px] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('defense')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold text-[10px] transition-colors flex items-center gap-1 ${
                viewMode === 'defense'
                  ? 'bg-[#1e3a5f] text-white'
                  : 'text-black hover:bg-[#dcdcdc]'
              }`}
              title="TrackEye Defense & Flight Telemetry: Mach, G-Force, Slant Range, Azimuth, Elevation"
            >
              <span>Defense Telemetry</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('standard')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold text-[10px] transition-colors ${
                viewMode === 'standard'
                  ? 'bg-[#1e3a5f] text-white'
                  : 'text-black hover:bg-[#dcdcdc]'
              }`}
            >
              Kinematics
            </button>
          </div>

          {/* Time Unit Selector */}
          <div className="flex items-center gap-1 ml-1 bg-[#efefef] border border-[#808080] rounded-[2px] px-1 py-0.5">
            <Clock className="w-3 h-3 text-[#555555]" />
            {(['auto', 's', 'ms', 'us'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setTableTimeUnit(u)}
                className={`px-1.5 py-0.2 rounded-[2px] font-mono text-[9px] font-bold ${
                  tableTimeUnit === u
                    ? 'bg-[#1e3a5f] text-white'
                    : 'text-black hover:bg-[#dcdcdc]'
                }`}
              >
                {u.toUpperCase()}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-[#333333] font-mono font-medium">
            ({steps.length} {steps.length === 1 ? 'row' : 'rows'})
          </span>

          {clip && clip.fps >= 1000 && (
            <span className="bg-[#1e3a5f] text-white px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-semibold">
              {clip.cameraModel || 'HIGH-SPEED'}: {clip.fps.toLocaleString()} fps
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="table-copy-tsv-btn"
            type="button"
            onClick={copyToClipboard}
            disabled={steps.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] disabled:opacity-40 text-black border border-[#808080] transition-colors text-[11px] font-medium"
            title="Copy TSV to clipboard for Excel / Google Sheets / MATLAB"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-700" />
            ) : (
              <Copy className="w-3 h-3 text-black" />
            )}
            <span>{copied ? 'Copied' : 'Copy TSV'}</span>
          </button>

          <button
            id="table-download-csv-btn"
            type="button"
            onClick={exportCSV}
            disabled={steps.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] disabled:opacity-40 text-black border border-[#808080] transition-colors text-[11px] font-medium"
            title="Export CSV telemetry file"
          >
            <Download className="w-3 h-3 text-black" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Content with Fixed Header & Alternating Zebra Striping */}
      <div className="flex-1 overflow-auto bg-white">
        {steps.length > 0 ? (
          <table className="w-full text-left font-mono border-collapse text-[11px]">
            <thead className="bg-[#e0e0e0] sticky top-0 z-10 border-b border-[#808080] text-black font-bold select-none whitespace-nowrap">
              {viewMode === 'defense' ? (
                <tr>
                  <th className="py-1.5 px-2 text-center w-10 border-r border-[#808080]">F#</th>
                  <th className="py-1.5 px-2 border-r border-[#808080] bg-[#dbeafe] text-[#1e3a5f]">
                    {timeHeader}
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">x (m)</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">y (m)</th>
                  {hasZ && <th className="py-1.5 px-2 border-r border-[#808080]">z (m)</th>}
                  <th className="py-1.5 px-2 border-r border-[#808080]">Slant R (m)</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">Azimuth (°)</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">Elevation (°)</th>
                  <th className="py-1.5 px-2 border-r border-[#808080] bg-[#fef3c7] text-[#92400e]">
                    Speed (m/s)
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#808080] bg-[#fef3c7] text-[#92400e]">
                    Mach
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#808080] bg-[#fee2e2] text-[#991b1b]">
                    G-Force (g)
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">a (m/s²)</th>
                  <th className="py-1.5 px-2 text-center w-8">Del</th>
                </tr>
              ) : (
                <tr>
                  <th className="py-1.5 px-2 text-center w-10 border-r border-[#808080]">F#</th>
                  <th className="py-1.5 px-2 border-r border-[#808080] bg-[#dbeafe] text-[#1e3a5f]">
                    {timeHeader}
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">x (m)</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">y (m)</th>
                  {hasZ && <th className="py-1.5 px-2 border-r border-[#808080]">z (m)</th>}
                  <th className="py-1.5 px-2 border-r border-[#808080]">vx</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">vy</th>
                  {hasZ && <th className="py-1.5 px-2 border-r border-[#808080]">vz</th>}
                  <th className="py-1.5 px-2 border-r border-[#808080]">v (m/s)</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">ax</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">ay</th>
                  <th className="py-1.5 px-2 border-r border-[#808080]">a (m/s²)</th>
                  <th className="py-1.5 px-2 text-center w-8">Del</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-[#cccccc] whitespace-nowrap">
              {steps.map((s, idx) => {
                const isActive = s.frame === currentFrame;
                const slantR = s.slantRange ?? Math.hypot(s.x, s.y, s.z ?? 0);
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
                    <td
                      className={`py-1 px-2 text-center border-r border-[#cccccc] font-semibold ${
                        isActive ? 'text-white' : 'text-[#555555]'
                      }`}
                    >
                      <span>{s.frame}</span>
                      {s.isInterpolatedCam2 && (
                        <span
                          className={`ml-1 text-[9px] font-bold ${isActive ? 'text-amber-300' : 'text-amber-600'}`}
                          title={`Camera 2 temporally interpolated (Sub-frame Spline matching, Δt=${((s.temporalDeltaSeconds || 0) * 1e6).toFixed(1)} µs)`}
                        >
                          ~
                        </span>
                      )}
                    </td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-semibold">
                      {formatStepTime(s.time)}
                    </td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-medium">
                      {s.x.toFixed(4)}
                    </td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-medium">
                      {s.y.toFixed(4)}
                    </td>
                    {viewMode === 'defense' ? (
                      <>
                        {hasZ && (
                          <td
                            className="py-1 px-2 border-r border-[#cccccc] font-medium"
                            title={s.isInterpolatedCam2 ? 'Triangulated using sub-frame spline-interpolated Camera 2 ray' : undefined}
                          >
                            {(s.z ?? 0).toFixed(4)}
                            {s.isInterpolatedCam2 && (
                              <span className={`text-[9px] font-bold ml-0.5 ${isActive ? 'text-amber-300' : 'text-amber-600'}`}>
                                *
                              </span>
                            )}
                          </td>
                        )}
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold">
                          {slantR.toFixed(4)}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {(s.azimuthDeg ?? 0).toFixed(2)}°
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {(s.elevationDeg ?? 0).toFixed(2)}°
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold text-amber-700">
                          {s.v !== null && s.v !== undefined ? s.v.toFixed(2) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold text-blue-700">
                          {s.machNumber !== null && s.machNumber !== undefined
                            ? `M ${s.machNumber.toFixed(3)}`
                            : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold text-red-700">
                          {s.gForce !== null && s.gForce !== undefined
                            ? `${s.gForce >= 1000 ? s.gForce.toExponential(2) : s.gForce.toFixed(1)} g`
                            : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {s.a !== null && s.a !== undefined
                            ? s.a >= 10000
                              ? s.a.toExponential(3)
                              : s.a.toFixed(2)
                            : '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        {hasZ && (
                          <td className="py-1 px-2 border-r border-[#cccccc] font-medium">
                            {(s.z ?? 0).toFixed(4)}
                          </td>
                        )}
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {s.vx !== null && s.vx !== undefined ? s.vx.toFixed(3) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {s.vy !== null && s.vy !== undefined ? s.vy.toFixed(3) : '—'}
                        </td>
                        {hasZ && (
                          <td className="py-1 px-2 border-r border-[#cccccc]">
                            {s.vz !== null && s.vz !== undefined ? s.vz.toFixed(3) : '—'}
                          </td>
                        )}
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold">
                          {s.v !== null && s.v !== undefined ? s.v.toFixed(3) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {s.ax !== null && s.ax !== undefined ? s.ax.toFixed(2) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {s.ay !== null && s.ay !== undefined ? s.ay.toFixed(2) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-semibold">
                          {s.a !== null && s.a !== undefined ? s.a.toFixed(2) : '—'}
                        </td>
                      </>
                    )}
                    <td className="py-1 px-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePoint(s.frame);
                        }}
                        className={`p-0.5 rounded transition-colors ${
                          isActive
                            ? 'text-white hover:text-red-300'
                            : 'text-[#666666] hover:text-[#8b0000]'
                        }`}
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
