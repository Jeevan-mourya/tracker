import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Crosshair,
  Upload,
  Play,
  CheckCircle2,
  Sliders,
  Sparkles,
  Layers,
  Compass,
} from 'lucide-react';
import {
  Track,
  GraphConfig,
  VirtualPoint3D,
  ClearanceEnvelopeSummary,
  SavedProjectData,
} from '../types';
import {
  CameraIntrinsicsK,
  DEFAULT_CAMERA_INTRINSICS,
  DEFAULT_VIRTUAL_POINTS,
  SurveyMarker3D,
  RigidBodyGroupId,
  parseLeicaSurveyCSV,
  solveMonocular6DoFSequence,
  createSampleStoreSeparationDataset,
  Frame6DoFResult,
  Vec3,
} from '../math/monocular6DoF';

type LiftedSixDofState = NonNullable<SavedProjectData['sixDofState']>;

function normalizeIntrinsics(
  raw: LiftedSixDofState['intrinsics'] | undefined,
  fallback: CameraIntrinsicsK
): CameraIntrinsicsK {
  if (!raw) return fallback;
  const rawRecord = raw as {
    fx?: number;
    fy?: number;
    cx?: number;
    cy?: number;
    width?: number;
    height?: number;
    k1?: number;
    k2?: number;
    k3?: number;
    p1?: number;
    p2?: number;
    distortion?: Partial<CameraIntrinsicsK['distortion']>;
  };
  const width =
    typeof rawRecord.width === 'number' && Number.isFinite(rawRecord.width)
      ? rawRecord.width
      : fallback.width;
  const height =
    typeof rawRecord.height === 'number' && Number.isFinite(rawRecord.height)
      ? rawRecord.height
      : fallback.height;

  if (rawRecord.distortion) {
    return {
      fx: Number.isFinite(rawRecord.fx) ? (rawRecord.fx as number) : fallback.fx,
      fy: Number.isFinite(rawRecord.fy) ? (rawRecord.fy as number) : fallback.fy,
      cx: Number.isFinite(rawRecord.cx) ? (rawRecord.cx as number) : fallback.cx,
      cy: Number.isFinite(rawRecord.cy) ? (rawRecord.cy as number) : fallback.cy,
      width,
      height,
      distortion: {
        enabled: Boolean(rawRecord.distortion.enabled),
        k1: rawRecord.distortion.k1 ?? 0,
        k2: rawRecord.distortion.k2 ?? 0,
        k3: rawRecord.distortion.k3 ?? 0,
        p1: rawRecord.distortion.p1 ?? 0,
        p2: rawRecord.distortion.p2 ?? 0,
      },
    };
  }
  const hasDist =
    Boolean(rawRecord.k1) ||
    Boolean(rawRecord.k2) ||
    Boolean(rawRecord.k3) ||
    Boolean(rawRecord.p1) ||
    Boolean(rawRecord.p2);
  return {
    fx: Number.isFinite(rawRecord.fx) ? (rawRecord.fx as number) : fallback.fx,
    fy: Number.isFinite(rawRecord.fy) ? (rawRecord.fy as number) : fallback.fy,
    cx: Number.isFinite(rawRecord.cx) ? (rawRecord.cx as number) : fallback.cx,
    cy: Number.isFinite(rawRecord.cy) ? (rawRecord.cy as number) : fallback.cy,
    width,
    height,
    distortion: {
      enabled: hasDist,
      k1: rawRecord.k1 ?? 0,
      k2: rawRecord.k2 ?? 0,
      k3: rawRecord.k3 ?? 0,
      p1: rawRecord.p1 ?? 0,
      p2: rawRecord.p2 ?? 0,
    },
  };
}

interface Monocular6DoFModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  fps: number;
  savedSixDofState?: SavedProjectData['sixDofState'];
  hydrationRevision?: number;
  onSixDofStateChange?: (updates: Partial<LiftedSixDofState>) => void;
  onApplySolvedTracks: (
    newTracks: Track[],
    selectTrackId: string,
    graphConfigUpdates?: Partial<GraphConfig>
  ) => void;
}

export const Monocular6DoFModal: React.FC<Monocular6DoFModalProps> = ({
  isOpen,
  onClose,
  tracks,
  fps,
  savedSixDofState,
  hydrationRevision = 0,
  onSixDofStateChange,
  onApplySolvedTracks,
}) => {
  const sampleBundle = useMemo(() => createSampleStoreSeparationDataset(25, fps || 500), [fps]);
  const defaultIntrinsics = sampleBundle.config.intrinsics || DEFAULT_CAMERA_INTRINSICS;

  const [intrinsics, setIntrinsics] = useState<CameraIntrinsicsK>(
    normalizeIntrinsics(savedSixDofState?.intrinsics, defaultIntrinsics)
  );
  const [markers, setMarkers] = useState<SurveyMarker3D[]>(
    savedSixDofState?.markers && savedSixDofState.markers.length > 0
      ? savedSixDofState.markers
      : sampleBundle.config.markers
  );
  const [csvText, setCsvText] = useState<string>(
    savedSixDofState?.csvText ?? sampleBundle.csvText
  );
  const [missileCg, setMissileCg] = useState<Vec3>(
    savedSixDofState?.missileCgBody || [0, 0, 0]
  );
  const [launcherRef, setLauncherRef] = useState<Vec3>(
    savedSixDofState?.launcherRefBody || [0, -0.22, 0.03]
  );
  const [aircraftRef, setAircraftRef] = useState<Vec3>(
    savedSixDofState?.aircraftRefBody || [0, -0.5, 0.05]
  );
  const [huberDeltaPx, setHuberDeltaPx] = useState<number>(
    savedSixDofState?.huberDeltaPx ?? 2.5
  );
  const [virtualPoints, setVirtualPoints] = useState<VirtualPoint3D[]>(
    savedSixDofState?.virtualPoints && savedSixDofState.virtualPoints.length > 0
      ? savedSixDofState.virtualPoints
      : DEFAULT_VIRTUAL_POINTS
  );
  const [clearanceEnvelope, setClearanceEnvelope] = useState<ClearanceEnvelopeSummary[] | null>(
    savedSixDofState?.clearanceEnvelope ?? null
  );
  const [overallMinClearance, setOverallMinClearance] = useState<ClearanceEnvelopeSummary | null>(
    savedSixDofState?.overallMinClearance ?? null
  );
  const [activeGroupTab, setActiveGroupTab] = useState<'ALL' | RigidBodyGroupId>('ALL');
  const [solvedResults, setSolvedResults] = useState<Frame6DoFResult[] | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Ref holds latest lifted state so hydration effect ONLY triggers on [isOpen, hydrationRevision]
  // (prevents circular parent->child->parent useEffect loops during user edits).
  const savedStateRef = useRef<SavedProjectData['sixDofState']>(savedSixDofState);
  savedStateRef.current = savedSixDofState;

  useEffect(() => {
    const saved = savedStateRef.current;
    if (!saved) return;
    if (saved.intrinsics) {
      setIntrinsics(normalizeIntrinsics(saved.intrinsics, defaultIntrinsics));
    }
    if (Array.isArray(saved.markers) && saved.markers.length > 0) setMarkers(saved.markers);
    if (typeof saved.csvText === 'string') setCsvText(saved.csvText);
    if (Array.isArray(saved.missileCgBody) && saved.missileCgBody.length === 3) {
      setMissileCg(saved.missileCgBody as Vec3);
    }
    if (Array.isArray(saved.launcherRefBody) && saved.launcherRefBody.length === 3) {
      setLauncherRef(saved.launcherRefBody as Vec3);
    }
    if (Array.isArray(saved.aircraftRefBody) && saved.aircraftRefBody.length === 3) {
      setAircraftRef(saved.aircraftRefBody as Vec3);
    }
    if (typeof saved.huberDeltaPx === 'number' && Number.isFinite(saved.huberDeltaPx)) {
      setHuberDeltaPx(saved.huberDeltaPx);
    }
    if (Array.isArray(saved.virtualPoints) && saved.virtualPoints.length > 0) {
      setVirtualPoints(saved.virtualPoints);
    }
    if (saved.clearanceEnvelope !== undefined) {
      setClearanceEnvelope(saved.clearanceEnvelope ?? null);
    }
    if (saved.overallMinClearance !== undefined) {
      setOverallMinClearance(saved.overallMinClearance ?? null);
    }
  }, [isOpen, hydrationRevision]);

  const emitSurveyUpdate = (patch: Partial<LiftedSixDofState>) => {
    onSixDofStateChange?.(patch);
  };

  if (!isOpen) return null;

  const handleParseCsv = () => {
    const parsed = parseLeicaSurveyCSV(csvText);
    if (parsed.length === 0) {
      setStatusBanner('No valid 3D Leica ACS control points found in CSV input.');
      return;
    }
    setMarkers(parsed);
    emitSurveyUpdate({ markers: parsed, csvText });
    setStatusBanner(
      `Parsed ${parsed.length} Leica ACS 3D markers (A: ${
        parsed.filter((m) => m.group === 'A').length
      }, L: ${parsed.filter((m) => m.group === 'L').length}, M: ${
        parsed.filter((m) => m.group === 'M').length
      }).`
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setCsvText(text);
      const parsed = parseLeicaSurveyCSV(text);
      if (parsed.length > 0) {
        setMarkers(parsed);
        emitSurveyUpdate({ markers: parsed, csvText: text });
        setStatusBanner(`Loaded ${parsed.length} Leica ACS survey points from ${file.name}.`);
      } else {
        emitSurveyUpdate({ csvText: text });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLoadSampleStoreSeparation = () => {
    const sample = createSampleStoreSeparationDataset(25, fps || 500);
    setIntrinsics(sample.config.intrinsics);
    setMarkers(sample.config.markers);
    setCsvText(sample.csvText);
    setMissileCg(sample.config.missileCgBody);
    setLauncherRef(sample.config.launcherRefBody);
    setAircraftRef(sample.config.aircraftRefBody);

    const solved = solveMonocular6DoFSequence(
      sample.markerTracks,
      { ...sample.config, virtualPoints },
      fps || 500
    );
    setSolvedResults(solved.frameResults);
    setClearanceEnvelope(solved.clearanceEnvelope);
    setOverallMinClearance(solved.overallMinClearance);
    emitSurveyUpdate({
      intrinsics: sample.config.intrinsics,
      markers: sample.config.markers,
      csvText: sample.csvText,
      missileCgBody: sample.config.missileCgBody,
      launcherRefBody: sample.config.launcherRefBody,
      aircraftRefBody: sample.config.aircraftRefBody,
      huberDeltaPx,
      virtualPoints,
      clearanceEnvelope: solved.clearanceEnvelope,
      overallMinClearance: solved.overallMinClearance,
    });

    const combinedTracks = [
      solved.synthesizedMissileTrack,
      solved.synthesizedLauncherTrack,
      ...sample.markerTracks,
    ];
    onApplySolvedTracks(combinedTracks, solved.synthesizedMissileTrack.id, {
      varY: 'y',
      varX: 't',
      viewMode: 'dual-sync',
      referenceFrameMode: 'M_wrt_L',
      coordConvention: 'ENU_Z_UP',
      showUncertaintyBand: true,
    });
    setStatusBanner(
      `Loaded & solved 25-frame @ ${fps || 500} fps Store Separation dataset (A1–A6 Aircraft, L7–L14 Launcher, M15–M22 Missile) with 6×6 Pose Covariance & Clearance Envelope.`
    );
  };

  const handleRunSolverOnCurrentTracks = () => {
    const sourceTracks =
      tracks.some((t) => t.rigidBodyGroup || /^[ALM]\d+/i.test(t.name))
        ? tracks
        : sampleBundle.markerTracks;

    const solved = solveMonocular6DoFSequence(
      sourceTracks,
      {
        intrinsics,
        markers,
        missileCgBody: missileCg,
        launcherRefBody: launcherRef,
        aircraftRefBody: aircraftRef,
        virtualPoints,
        huberDeltaPx,
        maxLmIterations: 50,
        useStaticAircraftIfUntracked: true,
        useStaticLauncherIfUntracked: true,
      },
      fps || 500
    );

    setSolvedResults(solved.frameResults);
    setClearanceEnvelope(solved.clearanceEnvelope);
    setOverallMinClearance(solved.overallMinClearance);
    emitSurveyUpdate({
      intrinsics,
      markers,
      csvText,
      missileCgBody: missileCg,
      launcherRefBody: launcherRef,
      aircraftRefBody: aircraftRef,
      huberDeltaPx,
      virtualPoints,
      clearanceEnvelope: solved.clearanceEnvelope,
      overallMinClearance: solved.overallMinClearance,
    });

    const filteredExisting = sourceTracks.filter(
      (t) =>
        t.id !== solved.synthesizedMissileTrack.id &&
        t.id !== solved.synthesizedLauncherTrack.id
    );
    const updatedTracks = [
      solved.synthesizedMissileTrack,
      solved.synthesizedLauncherTrack,
      ...filteredExisting,
    ];

    onApplySolvedTracks(updatedTracks, solved.synthesizedMissileTrack.id, {
      viewMode: 'dual-sync',
      referenceFrameMode: 'M_wrt_L',
      showUncertaintyBand: true,
    });

    setStatusBanner(
      `Solved ${solved.frameResults.length} frames via Iterative Levenberg-Marquardt PnP + SE(3) Adjoint Covariance Propagation.`
    );
  };

  const filteredMarkers =
    activeGroupTab === 'ALL'
      ? markers
      : markers.filter((m) => m.group === activeGroupTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none">
      <div className="bg-[#f0eee9] border-2 border-[#1e3a5f] rounded-[4px] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-xs text-black">
        {/* Header */}
        <div className="bg-[#1e3a5f] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Compass className="w-4 h-4 text-amber-300" />
            <div>
              <h2 className="font-bold text-sm tracking-tight">
                Monocular 6-DOF Store Separation Photogrammetry (Leica ACS Survey + Iterative LM PnP)
              </h2>
              <p className="text-[11px] text-blue-200">
                Multi-Body SE(3) Resection: Aircraft Reference (A1–A6) · Launcher Rail (L7–L14) · Separating Store (M15–M29)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/15 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {statusBanner && (
            <div className="bg-emerald-50 border border-emerald-600 text-emerald-950 px-3 py-2 rounded-[3px] flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{statusBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-[10px] underline text-emerald-800"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Top Action Bar */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="font-bold text-[#1e3a5f] text-xs flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Homogeneous SE(3) Relative Kinematic Chain</span>
              </div>
              <p className="text-[11px] text-[#444444] font-mono">
                T_A←M(t) = T_C←A⁻¹(t) · T_C←M(t) &nbsp;|&nbsp; T_L←M(t) = T_C←L⁻¹(t) · T_C←M(t)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-load-sample-store-separation"
                type="button"
                onClick={handleLoadSampleStoreSeparation}
                className="px-3 py-1.5 bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-[3px] flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load &amp; Solve 500 fps Store Separation Benchmark (A1–M22)</span>
              </button>

              <button
                id="btn-solve-monocular-6dof"
                type="button"
                onClick={handleRunSolverOnCurrentTracks}
                className="px-3 py-1.5 bg-[#1e3a5f] hover:bg-[#152a45] text-white font-bold rounded-[3px] flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Solve 6-DOF PnP Sequence</span>
              </button>
            </div>
          </div>

          {/* Grid: Camera Intrinsics K & Brown-Conrady Distortion + Leica CSV Input */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Camera Intrinsics K + Brown-Conrady + CG Offset */}
            <div className="bg-white border border-[#808080] rounded-[3px] p-3 space-y-3">
              <div className="font-bold text-[#1e3a5f] border-b border-[#cccccc] pb-1.5 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>1. Camera Intrinsics Matrix K &amp; Brown-Conrady Distortion</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">fx (px)</label>
                  <input
                    type="number"
                    value={intrinsics.fx}
                    onChange={(e) => {
                      const next = { ...intrinsics, fx: parseFloat(e.target.value) || 1600 };
                      setIntrinsics(next);
                      emitSurveyUpdate({ intrinsics: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-1 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">fy (px)</label>
                  <input
                    type="number"
                    value={intrinsics.fy}
                    onChange={(e) => {
                      const next = { ...intrinsics, fy: parseFloat(e.target.value) || 1600 };
                      setIntrinsics(next);
                      emitSurveyUpdate({ intrinsics: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-1 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">cx (px)</label>
                  <input
                    type="number"
                    value={intrinsics.cx}
                    onChange={(e) => {
                      const next = { ...intrinsics, cx: parseFloat(e.target.value) || 640 };
                      setIntrinsics(next);
                      emitSurveyUpdate({ intrinsics: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-1 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">cy (px)</label>
                  <input
                    type="number"
                    value={intrinsics.cy}
                    onChange={(e) => {
                      const next = { ...intrinsics, cy: parseFloat(e.target.value) || 360 };
                      setIntrinsics(next);
                      emitSurveyUpdate({ intrinsics: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-1 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 font-bold text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={intrinsics.distortion.enabled}
                    onChange={(e) => {
                      const next = {
                        ...intrinsics,
                        distortion: { ...intrinsics.distortion, enabled: e.target.checked },
                      };
                      setIntrinsics(next);
                      emitSurveyUpdate({ intrinsics: next });
                    }}
                  />
                  <span>Enable Brown-Conrady Undistortion (k₁, k₂, k₃, p₁, p₂)</span>
                </label>

                <div className="grid grid-cols-5 gap-1.5">
                  {(['k1', 'k2', 'k3', 'p1', 'p2'] as const).map((coeff) => (
                    <div key={coeff}>
                      <label className="block text-[10px] font-mono text-[#555555]">{coeff}</label>
                      <input
                        type="number"
                        step="0.001"
                        value={(intrinsics.distortion as any)[coeff] ?? 0}
                        onChange={(e) => {
                          const next = {
                            ...intrinsics,
                            distortion: {
                              ...intrinsics.distortion,
                              [coeff]: parseFloat(e.target.value) || 0,
                            },
                          };
                          setIntrinsics(next);
                          emitSurveyUpdate({ intrinsics: next });
                        }}
                        className="w-full border border-[#808080] rounded-[2px] px-1 py-0.5 font-mono text-[10px]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Missile CG / Virtual Point & Huber Delta */}
              <div className="border-t border-[#cccccc] pt-2 grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">
                    Missile CG X (m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={missileCg[0]}
                    onChange={(e) => {
                      const next: Vec3 = [parseFloat(e.target.value) || 0, missileCg[1], missileCg[2]];
                      setMissileCg(next);
                      emitSurveyUpdate({ missileCgBody: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-0.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">
                    Missile CG Y (m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={missileCg[1]}
                    onChange={(e) => {
                      const next: Vec3 = [missileCg[0], parseFloat(e.target.value) || 0, missileCg[2]];
                      setMissileCg(next);
                      emitSurveyUpdate({ missileCgBody: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-0.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">
                    Missile CG Z (m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={missileCg[2]}
                    onChange={(e) => {
                      const next: Vec3 = [missileCg[0], missileCg[1], parseFloat(e.target.value) || 0];
                      setMissileCg(next);
                      emitSurveyUpdate({ missileCgBody: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-0.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#444444]">
                    Huber δ (px)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={huberDeltaPx}
                    onChange={(e) => {
                      const next = parseFloat(e.target.value) || 2.5;
                      setHuberDeltaPx(next);
                      emitSurveyUpdate({ huberDeltaPx: next });
                    }}
                    className="w-full border border-[#808080] rounded-[2px] px-1.5 py-0.5 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Right: Leica Laser Tracker ACS Survey CSV Import */}
            <div className="bg-white border border-[#808080] rounded-[3px] p-3 flex flex-col space-y-2">
              <div className="flex items-center justify-between border-b border-[#cccccc] pb-1.5">
                <span className="font-bold text-[#1e3a5f] flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>2. Leica Laser Tracker 3D ACS Survey Import (A / L / M)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <label className="px-2 py-0.5 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] rounded-[2px] font-bold text-[10px] cursor-pointer flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    <span>Import CSV</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleParseCsv}
                    className="px-2 py-0.5 bg-[#1e3a5f] text-white rounded-[2px] font-bold text-[10px]"
                  >
                    Parse Table
                  </button>
                </div>
              </div>

              <textarea
                value={csvText}
                onChange={(e) => {
                  const next = e.target.value;
                  setCsvText(next);
                  emitSurveyUpdate({ csvText: next });
                }}
                rows={7}
                className="w-full border border-[#808080] rounded-[2px] p-1.5 font-mono text-[10px] bg-[#f8fafc] focus:outline-none"
                placeholder="PointID,Group[A|L|M],X,Y,Z,u_init,v_init"
              />
              <p className="text-[10px] text-[#555555]">
                Format: <code>PointID, Group[A|L|M], X(m), Y(m), Z(m), u_init(px), v_init(px)</code>.
                Point IDs <code>A1–A6</code> auto-map to Aircraft, <code>L7–L14</code> to Launcher, and <code>M15–M29</code> to Missile.
              </p>
            </div>
          </div>

          {/* 3D Survey Markers Table by Group */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#cccccc] pb-1.5">
              <div className="font-bold text-[#1e3a5f]">
                3. Rigid-Body Control Point Partition ({markers.length} Total Survey Markers)
              </div>
              <div className="flex items-center gap-1">
                {(['ALL', 'A', 'L', 'M'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveGroupTab(tab)}
                    className={`px-2.5 py-0.5 rounded-[2px] font-bold text-[10px] border ${
                      activeGroupTab === tab
                        ? 'bg-[#1e3a5f] text-white border-[#0f1d30]'
                        : 'bg-[#efefef] text-black border-[#808080]'
                    }`}
                  >
                    {tab === 'ALL'
                      ? `All (${markers.length})`
                      : tab === 'A'
                      ? `Aircraft A (${markers.filter((m) => m.group === 'A').length})`
                      : tab === 'L'
                      ? `Launcher L (${markers.filter((m) => m.group === 'L').length})`
                      : `Missile M (${markers.filter((m) => m.group === 'M').length})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto border border-[#cccccc]">
              <table className="w-full text-left border-collapse font-mono text-[10px]">
                <thead className="bg-[#e8e6e1] text-black sticky top-0">
                  <tr>
                    <th className="p-1.5 border-b border-[#cccccc]">Point ID</th>
                    <th className="p-1.5 border-b border-[#cccccc]">Rigid Body Group</th>
                    <th className="p-1.5 border-b border-[#cccccc]">X_ACS (m)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">Y_ACS (m)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">Z_ACS (m)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">u_init (px)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">v_init (px)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMarkers.map((m) => (
                    <tr key={m.id} className="border-b border-[#eeeeee] hover:bg-[#f8fafc]">
                      <td className="p-1.5 font-bold">{m.id}</td>
                      <td className="p-1.5">
                        <span
                          className={`px-1.5 py-0.2 rounded-[2px] font-bold text-white ${
                            m.group === 'A'
                              ? 'bg-[#0284c7]'
                              : m.group === 'L'
                              ? 'bg-[#d97706]'
                              : 'bg-[#dc2626]'
                          }`}
                        >
                          {m.group === 'A'
                            ? 'A — Aircraft Ref'
                            : m.group === 'L'
                            ? 'L — Launcher Rail'
                            : 'M — Missile Store'}
                        </span>
                      </td>
                      <td className="p-1.5">{m.x.toFixed(4)}</td>
                      <td className="p-1.5">{m.y.toFixed(4)}</td>
                      <td className="p-1.5">{m.z.toFixed(4)}</td>
                      <td className="p-1.5">{m.u_init !== undefined ? m.u_init.toFixed(2) : '—'}</td>
                      <td className="p-1.5">{m.v_init !== undefined ? m.v_init.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Virtual Critical Points & Minimum Store-to-Pylon Clearance Envelope */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#cccccc] pb-1.5">
              <div className="font-bold text-[#1e3a5f]">
                4. Virtual Critical Points &amp; Minimum Store-to-Pylon Clearance Envelope (P_virt^L(t) = T_L←M(t) · P_virt^M)
              </div>
              {overallMinClearance && (
                <span className="px-2 py-0.5 bg-amber-100 border border-amber-700 text-amber-950 rounded-[2px] font-mono font-bold text-[10px]">
                  Critical Min Clearance: {overallMinClearance.virtualPointName} ={' '}
                  {(overallMinClearance.minDistanceMeters * 1000).toFixed(1)} mm @ Frame #
                  {overallMinClearance.closestApproachFrame} ({overallMinClearance.closestApproachTime.toFixed(4)} s)
                </span>
              )}
            </div>

            <div className="overflow-x-auto border border-[#cccccc]">
              <table className="w-full text-left border-collapse font-mono text-[10px]">
                <thead className="bg-[#e8e6e1] text-black">
                  <tr>
                    <th className="p-1.5 border-b border-[#cccccc]">Virtual Point Name</th>
                    <th className="p-1.5 border-b border-[#cccccc]">X_M (m)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">Y_M (m)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">Z_M (m)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">Min Pylon Clearance (mm)</th>
                    <th className="p-1.5 border-b border-[#cccccc]">Closest Approach Frame</th>
                  </tr>
                </thead>
                <tbody>
                  {virtualPoints.map((vp, idx) => {
                    const env = clearanceEnvelope?.find((c) => c.virtualPointId === vp.id);
                    return (
                      <tr key={vp.id} className="border-b border-[#eeeeee] hover:bg-[#f8fafc]">
                        <td className="p-1.5 font-bold text-[#1e3a5f]">{vp.name}</td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.05"
                            value={vp.x}
                            onChange={(e) => {
                              const next = [...virtualPoints];
                              next[idx] = { ...vp, x: parseFloat(e.target.value) || 0 };
                              setVirtualPoints(next);
                              emitSurveyUpdate({ virtualPoints: next });
                            }}
                            className="w-20 border border-[#808080] rounded-[2px] px-1 py-0.5 font-mono"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.05"
                            value={vp.y}
                            onChange={(e) => {
                              const next = [...virtualPoints];
                              next[idx] = { ...vp, y: parseFloat(e.target.value) || 0 };
                              setVirtualPoints(next);
                              emitSurveyUpdate({ virtualPoints: next });
                            }}
                            className="w-20 border border-[#808080] rounded-[2px] px-1 py-0.5 font-mono"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.05"
                            value={vp.z}
                            onChange={(e) => {
                              const next = [...virtualPoints];
                              next[idx] = { ...vp, z: parseFloat(e.target.value) || 0 };
                              setVirtualPoints(next);
                              emitSurveyUpdate({ virtualPoints: next });
                            }}
                            className="w-20 border border-[#808080] rounded-[2px] px-1 py-0.5 font-mono"
                          />
                        </td>
                        <td className="p-1.5 font-bold text-amber-900">
                          {env ? `${(env.minDistanceMeters * 1000).toFixed(2)} mm` : '—'}
                        </td>
                        <td className="p-1.5">
                          {env
                            ? `#${env.closestApproachFrame} (${env.closestApproachTime.toFixed(4)} s)`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Solved 6-DOF Telemetry Preview Table */}
          {solvedResults && solvedResults.length > 0 && (
            <div className="bg-white border border-[#808080] rounded-[3px] p-3 space-y-2">
              <div className="font-bold text-[#047857] border-b border-[#cccccc] pb-1">
                5. Solved Relative 6-DOF Store Separation Telemetry &amp; 1-Sigma Pose Covariance (Missile wrt Launcher T_L←M)
              </div>
              <div className="max-h-48 overflow-y-auto border border-[#cccccc]">
                <table className="w-full text-left border-collapse font-mono text-[10px]">
                  <thead className="bg-[#e8e6e1] text-black sticky top-0">
                    <tr>
                      <th className="p-1.5 border-b border-[#cccccc]">Frame</th>
                      <th className="p-1.5 border-b border-[#cccccc]">Time (s)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">ΔX_M/L (m)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">ΔY_M/L (m)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">ΔZ_M/L (m)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">Roll φ (°)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">Pitch θ (°)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">Yaw ψ (°)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">±σ_pos (mm)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">±σ_att (°)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">N(A/L/M)</th>
                      <th className="p-1.5 border-b border-[#cccccc]">PnP RMSE (px)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solvedResults.slice(0, 30).map((r) => {
                      const state = r.relMissileWrtLauncher || r.relMissileWrtAircraft;
                      const unc = state?.uncertainty1Sigma;
                      const sigPosMm = unc
                        ? Math.hypot(unc.sigmaX, unc.sigmaY, unc.sigmaZ) * 1000
                        : null;
                      const sigAttDeg = unc
                        ? Math.hypot(unc.sigmaRoll, unc.sigmaPitch, unc.sigmaYaw)
                        : null;
                      return (
                        <tr key={r.frame} className="border-b border-[#eeeeee] hover:bg-[#f8fafc]">
                          <td className="p-1.5 font-bold">#{r.frame}</td>
                          <td className="p-1.5">{r.time.toFixed(4)}</td>
                          <td className="p-1.5">
                            {state ? state.referencePointPosition[0].toFixed(4) : '—'}
                          </td>
                          <td className="p-1.5">
                            {state ? state.referencePointPosition[1].toFixed(4) : '—'}
                          </td>
                          <td className="p-1.5">
                            {state ? state.referencePointPosition[2].toFixed(4) : '—'}
                          </td>
                          <td className="p-1.5">{state ? state.euler.rollDeg.toFixed(2) : '—'}</td>
                          <td className="p-1.5">{state ? state.euler.pitchDeg.toFixed(2) : '—'}</td>
                          <td className="p-1.5">{state ? state.euler.yawDeg.toFixed(2) : '—'}</td>
                          <td className="p-1.5 text-slate-700 font-semibold">
                            {sigPosMm !== null ? `±${sigPosMm.toFixed(2)}` : '—'}
                          </td>
                          <td className="p-1.5 text-slate-700 font-semibold">
                            {sigAttDeg !== null ? `±${sigAttDeg.toFixed(3)}°` : '—'}
                          </td>
                          <td className="p-1.5">
                            {r.markerCountA}/{r.markerCountL}/{r.markerCountM}
                          </td>
                          <td className="p-1.5 text-emerald-700 font-bold">
                            {r.poseCamFromMissile ? r.poseCamFromMissile.rmsePx.toFixed(3) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#d4d0c8] border-t border-[#808080] px-4 py-2 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-white hover:bg-[#e0ded8] border border-[#808080] rounded-[3px] font-bold text-black cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
