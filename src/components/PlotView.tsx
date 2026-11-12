import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Track,
  PlotVariable,
  GraphAxisVariable,
  GraphTransformMode,
  GraphViewLayout,
  SixDofChannel,
  AngleWrapMode,
  AngleUnit,
  GraphConfig,
  PublicationPlotTheme,
  FitType,
  FitResult,
  ChannelSignMode,
  SixDofSignMatrixConfig,
} from '../types';
import { fitLinear, fitParabolic, fitCubic } from '../utils/physics';
import {
  SIX_DOF_CHANNELS,
  TRANSLATIONAL_CHANNELS,
  ROTATIONAL_CHANNELS,
  CHANNEL_COLORS,
  DEFAULT_GRAPH_CONFIG,
  DEFAULT_MISSILE_NED_SIGN_MATRIX,
  STANDARD_CARTESIAN_ENU_SIGN_MATRIX,
  getDefaultSignMatrixForConvention,
  RESEARCH_PLOT_PRESETS,
  formatSignMatrixSummary,
  getParentSixDofChannel,
  isRotationalChannel,
  isTranslationalChannel,
  isVectorOrPathTransformAllowed,
  swapGraphAxes,
  deriveSixChannelSeries,
  getChannelUnit,
  getChannelLabel,
  DerivedGraphPoint,
} from '../utils/sixChannelGraphing';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Calculator,
  Grid3X3,
  BarChart2,
  ArrowLeftRight,
  Crosshair,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  SplitSquareVertical,
  Compass,
  Move,
  ChevronLeft,
  ChevronRight,
  Download,
  Sliders,
  X,
  GripHorizontal,
} from 'lucide-react';

interface PlotViewProps {
  tracks: Track[];
  activeTrackId: string;
  currentFrame: number;
  onSelectFrame: (frame: number) => void;
  graphConfig?: GraphConfig;
  onUpdateGraphConfig?: (updates: Partial<GraphConfig>) => void;
}

const CHANNEL_DISPLAY_NAMES: Record<SixDofChannel, { short: string; full: string; axis: string }> = {
  x: { short: 'X', full: 'X Translation', axis: 'X-Axis' },
  y: { short: 'Y', full: 'Y Translation', axis: 'Y-Axis' },
  z: { short: 'Z', full: 'Z Translation', axis: 'Z-Axis' },
  roll: { short: 'Roll', full: 'Roll (φ)', axis: 'About X' },
  pitch: { short: 'Pitch', full: 'Pitch (θ)', axis: 'About Y' },
  yaw: { short: 'Yaw', full: 'Yaw (ψ)', axis: 'About Z' },
};

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a publication-grade standalone Vector SVG string for the active telemetry graph,
 * supporting both IEEE / Defense Report (`publication-light`) and Workstation HUD (`tactical-dark`) themes
 * with embedded range-safety telemetry metadata caption block.
 */
export function renderPublicationPlotSVG(
  activeTrack: Track | undefined,
  config: GraphConfig,
  derivedPoints?: DerivedGraphPoint[],
  themeOverride?: PublicationPlotTheme
): string {
  const effectiveConfig: GraphConfig = { ...DEFAULT_GRAPH_CONFIG, ...config };
  const theme: PublicationPlotTheme =
    themeOverride || effectiveConfig.publicationTheme || 'publication-light';
  const isLight = theme === 'publication-light';

  const pts =
    derivedPoints ||
    (activeTrack?.steps && activeTrack.steps.length > 0
      ? deriveSixChannelSeries(activeTrack.steps, effectiveConfig, effectiveConfig.varX === 't').points
      : []);

  const width = 1200;
  const height = 820;
  const bg = isLight ? '#ffffff' : '#0b1120';
  const panelBg = isLight ? '#fafafa' : '#0f172a';
  const fg = isLight ? '#0f172a' : '#f8fafc';
  const subFg = isLight ? '#334155' : '#94a3b8';
  const gridStroke = isLight ? '#cbd5e1' : '#1e293b';
  const borderStroke = isLight ? '#334155' : '#475569';
  const signedStroke = isLight
    ? CHANNEL_COLORS[effectiveConfig.varY] || '#1e3a5f'
    : '#38bdf8';
  const distStroke = isLight ? '#047857' : '#34d399';
  const sigmaFill = isLight ? 'rgba(30, 58, 95, 0.14)' : 'rgba(56, 189, 248, 0.18)';

  const varX = effectiveConfig.varX || 't';
  const varY = effectiveConfig.varY || 'z';
  const angleUnit = effectiveConfig.angleUnit || 'deg';
  const xLabel = getChannelLabel(
    varX,
    effectiveConfig.transformModeX || 'signed',
    true,
    angleUnit
  );
  const ySignedLabel = getChannelLabel(varY, 'signed', true, angleUnit);
  const effectivePanel2Mode = !isVectorOrPathTransformAllowed(
    varY,
    effectiveConfig.panel2TransformMode || 'abs'
  )
    ? 'abs'
    : effectiveConfig.panel2TransformMode || 'abs';
  const yDistanceLabel = getChannelLabel(varY, effectivePanel2Mode, true, angleUnit);

  const refFrameMode = effectiveConfig.referenceFrameMode || 'M_wrt_L';
  const coordConv = effectiveConfig.coordConvention || 'NED_Z_DOWN';
  const signSummary = formatSignMatrixSummary(
    coordConv,
    effectiveConfig.channelSignConfig,
    effectiveConfig.invertChannels,
    true
  );
  const virtPtId = effectiveConfig.activeVirtualPointId || 'vp-cg';
  const virtPtObj = activeTrack?.virtualPointsCatalog?.find((v) => v.id === virtPtId);
  const virtPtLabel = virtPtObj ? `${virtPtObj.name} (${virtPtObj.id})` : virtPtId;

  const filterCfg = effectiveConfig.filterConfig || { type: 'raw', windowSize: 7, polyOrder: 2, cutoffHz: 45 };
  const filterDesc =
    filterCfg.type === 'savgol'
      ? `Savitzky-Golay (W=${filterCfg.windowSize || 7}, P=${filterCfg.polyOrder || 2})`
      : filterCfg.type === 'butterworth'
      ? `4th-Order Zero-Phase Butterworth LP (${filterCfg.cutoffHz || 45} Hz)`
      : 'Raw Unfiltered';

  const t0Point = pts.find((p) => p.isReferenceT0) || pts[0];
  const t0Text = t0Point ? `Frame #${t0Point.frame} (${(t0Point.rawTime ?? t0Point.relTime ?? 0).toFixed(4)} s)` : 'Frame #0';

  const minClearanceText = activeTrack?.overallMinClearance
    ? `${activeTrack.overallMinClearance.virtualPointName}: ${(
        activeTrack.overallMinClearance.minDistanceMeters * 1000
      ).toFixed(1)} mm @ F#${activeTrack.overallMinClearance.closestApproachFrame}`
    : 'N/A';

  const validX = pts.map((p) => p.xVal).filter((v): v is number => v !== null && Number.isFinite(v));
  const minX = validX.length > 0 ? Math.min(...validX) : 0;
  const maxX = validX.length > 0 ? Math.max(...validX) : 1;
  const spanX = Math.max(1e-6, maxX - minX);

  const renderPanel = (
    topY: number,
    panelH: number,
    title: string,
    yLabel: string,
    getVal: (p: DerivedGraphPoint) => number | null,
    getUpper: (p: DerivedGraphPoint) => number | null,
    getLower: (p: DerivedGraphPoint) => number | null,
    strokeColor: string,
    forceNonNegative: boolean
  ) => {
    const padL = 92;
    const padR = 40;
    const padT = 34;
    const padB = 42;
    const plotX = padL;
    const plotY = topY + padT;
    const plotW = width - padL - padR;
    const plotH = panelH - padT - padB;

    const ys: number[] = [];
    pts.forEach((p) => {
      const v = getVal(p);
      if (v !== null && Number.isFinite(v)) ys.push(v);
      if (effectiveConfig.showUncertaintyBand) {
        const u = getUpper(p);
        const l = getLower(p);
        if (u !== null && Number.isFinite(u)) ys.push(u);
        if (l !== null && Number.isFinite(l)) ys.push(l);
      }
    });

    let minY = ys.length > 0 ? Math.min(...ys) : -1;
    let maxY = ys.length > 0 ? Math.max(...ys) : 1;
    if (forceNonNegative) minY = 0;
    if (Math.abs(maxY - minY) < 1e-6) {
      maxY += 1;
      if (!forceNonNegative) minY -= 1;
    } else {
      const pad = (maxY - minY) * 0.08;
      maxY += pad;
      if (!forceNonNegative) minY -= pad;
    }
    const spanY = Math.max(1e-6, maxY - minY);

    const mapX = (x: number) => plotX + ((x - minX) / spanX) * plotW;
    const mapY = (y: number) => plotY + plotH - ((y - minY) / spanY) * plotH;

    // Grid lines
    const gridLines: string[] = [];
    for (let i = 0; i <= 5; i++) {
      const gy = plotY + (i / 5) * plotH;
      const yVal = maxY - (i / 5) * spanY;
      gridLines.push(
        `<line x1="${plotX}" y1="${gy.toFixed(1)}" x2="${plotX + plotW}" y2="${gy.toFixed(
          1
        )}" stroke="${gridStroke}" stroke-dasharray="3 3" stroke-width="1" />`,
        `<text x="${plotX - 10}" y="${(gy + 4).toFixed(
          1
        )}" fill="${subFg}" font-family="monospace" font-size="11" text-anchor="end">${yVal.toFixed(
          3
        )}</text>`
      );
    }
    for (let i = 0; i <= 6; i++) {
      const gx = plotX + (i / 6) * plotW;
      const xVal = minX + (i / 6) * spanX;
      gridLines.push(
        `<line x1="${gx.toFixed(1)}" y1="${plotY}" x2="${gx.toFixed(1)}" y2="${
          plotY + plotH
        }" stroke="${gridStroke}" stroke-dasharray="3 3" stroke-width="1" />`,
        `<text x="${gx.toFixed(1)}" y="${
          plotY + plotH + 18
        }" fill="${subFg}" font-family="monospace" font-size="11" text-anchor="middle">${xVal.toFixed(
          3
        )}</text>`
      );
    }

    // Zero reference line if in range
    let zeroLine = '';
    if (minY <= 0 && maxY >= 0) {
      const zy = mapY(0);
      zeroLine = `<line x1="${plotX}" y1="${zy.toFixed(1)}" x2="${plotX + plotW}" y2="${zy.toFixed(
        1
      )}" stroke="${borderStroke}" stroke-dasharray="5 3" stroke-width="1.2" />`;
    }

    // Covariance polygon if enabled
    let covPolygon = '';
    if (effectiveConfig.showUncertaintyBand) {
      const validBandPts = pts.filter(
        (p) =>
          p.xVal !== null &&
          getUpper(p) !== null &&
          getLower(p) !== null &&
          Number.isFinite(p.xVal) &&
          Number.isFinite(getUpper(p)) &&
          Number.isFinite(getLower(p))
      );
      if (validBandPts.length >= 2) {
        const upperCoords = validBandPts.map(
          (p) => `${mapX(p.xVal!).toFixed(1)},${mapY(getUpper(p)!).toFixed(1)}`
        );
        const lowerCoords = [...validBandPts]
          .reverse()
          .map((p) => `${mapX(p.xVal!).toFixed(1)},${mapY(getLower(p)!).toFixed(1)}`);
        covPolygon = `<polygon points="${[...upperCoords, ...lowerCoords].join(
          ' '
        )}" fill="${sigmaFill}" stroke="none" />`;
      }
    }

    // Curve polyline and markers
    const polyPts: string[] = [];
    const circles: string[] = [];
    pts.forEach((p) => {
      const xv = p.xVal;
      const yv = getVal(p);
      if (xv === null || yv === null || !Number.isFinite(xv) || !Number.isFinite(yv)) return;
      const cx = mapX(xv);
      const cy = mapY(yv);
      polyPts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
      circles.push(
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(
          1
        )}" r="3" fill="${strokeColor}" stroke="${bg}" stroke-width="1" />`
      );
    });

    const polyline =
      polyPts.length >= 2
        ? `<polyline fill="none" stroke="${strokeColor}" stroke-width="2.4" points="${polyPts.join(
            ' '
          )}" />`
        : '';

    return `
      <g>
        <rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}" fill="${panelBg}" stroke="${borderStroke}" stroke-width="1.2" />
        <text x="${plotX}" y="${
      topY + 22
    }" fill="${fg}" font-family="sans-serif" font-size="13" font-weight="bold">${escapeXml(
      title
    )}</text>
        ${gridLines.join('\n')}
        ${zeroLine}
        ${covPolygon}
        ${polyline}
        ${circles.join('\n')}
        <text x="${plotX + plotW / 2}" y="${
      plotY + plotH + 35
    }" fill="${fg}" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${escapeXml(
      xLabel
    )}</text>
        <text x="24" y="${
          plotY + plotH / 2
        }" fill="${fg}" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle" transform="rotate(-90, 24, ${
      plotY + plotH / 2
    })">${escapeXml(yLabel)}</text>
      </g>
    `;
  };

  const isDual = effectiveConfig.viewMode === 'dual-sync';
  const plotsMarkup = isDual
    ? renderPanel(
        64,
        305,
        `Panel 1 — Signed Displacement / Attitude: ${ySignedLabel}`,
        ySignedLabel,
        (p) => p.ySigned,
        (p) => p.ySignedUpper,
        (p) => p.ySignedLower,
        signedStroke,
        false
      ) +
      renderPanel(
        378,
        305,
        `Panel 2 — Non-Negative Distance from t0: ${yDistanceLabel}`,
        yDistanceLabel,
        (p) => p.yPanel2Distance,
        (p) => p.yDistUpper,
        (p) => p.yDistLower,
        distStroke,
        true
      )
    : renderPanel(
        64,
        615,
        `Motion Telemetry Plot — ${getChannelLabel(
          varY,
          effectiveConfig.transformMode,
          true,
          angleUnit
        )}`,
        getChannelLabel(varY, effectiveConfig.transformMode, true, angleUnit),
        (p) => p.yActive,
        (p) => p.ySignedUpper,
        (p) => p.ySignedLower,
        signedStroke,
        effectiveConfig.transformMode !== 'signed'
      );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" />
  <!-- Header Title Banner -->
  <text x="40" y="34" fill="${fg}" font-family="sans-serif" font-size="17" font-weight="bold">
    DEFENSE RANGE-SAFETY PHOTOGRAMMETRY &amp; 6-DOF TELEMETRY REPORT — ${escapeXml(
      activeTrack?.name || 'Active Track'
    )}
  </text>
  <text x="${width - 40}" y="34" fill="${subFg}" font-family="monospace" font-size="11" text-anchor="end">
    Theme: ${theme === 'publication-light' ? 'IEEE / Defense Publication Light' : 'Tactical Workstation Dark'}
  </text>
  <line x1="40" y1="46" x2="${width - 40}" y2="46" stroke="${borderStroke}" stroke-width="1.5" />

  ${plotsMarkup}

  <!-- Embedded Telemetry Metadata Caption Block -->
  <g transform="translate(40, 700)">
    <rect x="0" y="0" width="${
      width - 80
    }" height="96" rx="2" fill="${panelBg}" stroke="${borderStroke}" stroke-width="1.2" />
    <text x="16" y="24" fill="${fg}" font-family="monospace" font-size="12" font-weight="bold">
      TELEMETRY CERTIFICATION CAPTION • Track: ${escapeXml(
        activeTrack?.name || 'N/A'
      )} • Virtual Point: ${escapeXml(virtPtLabel)}
    </text>
    <text x="16" y="46" fill="${subFg}" font-family="monospace" font-size="11">
      Reference Frame: ${escapeXml(refFrameMode)} | Axes Convention: ${escapeXml(
    coordConv
  )} (${escapeXml(signSummary)}) | Event-Zero Tare (t0): ${escapeXml(t0Text)}
    </text>
    <text x="16" y="66" fill="${subFg}" font-family="monospace" font-size="11">
      Derivative Filter: ${escapeXml(filterDesc)} | ±1σ Pose Covariance Band: ${
    effectiveConfig.showUncertaintyBand ? 'ENABLED (SE(3) Adjoint)' : 'OFF'
  }
    </text>
    <text x="16" y="86" fill="${fg}" font-family="monospace" font-size="11" font-weight="bold">
      Min Store-to-Pylon Clearance Envelope: ${escapeXml(minClearanceText)}
    </text>
  </g>
</svg>`;
}

export const PlotView: React.FC<PlotViewProps> = ({
  tracks,
  activeTrackId,
  currentFrame,
  onSelectFrame,
  graphConfig: externalConfig,
  onUpdateGraphConfig,
}) => {
  // Load initial config from external prop or localStorage fallback
  const [internalConfig, setInternalConfig] = useState<GraphConfig>(() => {
    if (externalConfig) {
      return { ...DEFAULT_GRAPH_CONFIG, ...externalConfig };
    }
    try {
      const saved = localStorage.getItem('tracker_graph_config_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_GRAPH_CONFIG, ...parsed };
      }
    } catch {
      // ignore storage errors
    }
    return { ...DEFAULT_GRAPH_CONFIG };
  });

  // Sync when externalConfig changes (e.g. when reopening a saved project)
  useEffect(() => {
    if (externalConfig) {
      setInternalConfig((prev) => ({
        ...prev,
        ...externalConfig,
      }));
    }
  }, [externalConfig]);

  const updateConfig = useCallback(
    (updates: Partial<GraphConfig>) => {
      setInternalConfig((prev) => {
        const next: GraphConfig = { ...prev, ...updates };
        // Guard against applying 3D translational vector magnitude or path length to rotational channels
        if (
          isRotationalChannel(next.varY) &&
          (next.transformMode === 'magnitude' || next.transformMode === 'path_length')
        ) {
          next.transformMode = 'abs';
        }
        try {
          localStorage.setItem('tracker_graph_config_v2', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      onUpdateGraphConfig?.(updates);
    },
    [onUpdateGraphConfig]
  );

  const {
    varY = 'x',
    varX = 't',
    selectedChannels = ['x', 'y', 'z'],
    transformMode = 'signed',
    transformModeX = 'signed',
    invertVarX = false,
    panel2TransformMode = 'abs',
    viewMode = 'dual-sync',
    referenceFrameT0 = null,
    relativeToOrigin = true,
    useRelativeTime = true,
    angleWrapMode = 'unwrapped',
    angleUnit = 'deg',
    coordConvention = 'NED_Z_DOWN',
    channelSignConfig,
    referenceFrameMode = 'M_wrt_L',
    activeVirtualPointId = 'vp-cg',
    invertChannels = {},
    filterConfig = { type: 'raw', windowSize: 7, polyOrder: 2, cutoffHz: 45 },
    showUncertaintyBand = true,
    publicationTheme = 'publication-light',
    dualGraphSplitPct = 50,
    showSettingsDrawer = false,
    showOverlayDistance = true,
    showLegend = true,
    fitType = 'none',
    zoomDomainX = null,
    zoomDomainY = null,
  } = internalConfig;

  const effectiveSignMatrix: SixDofSignMatrixConfig = useMemo(() => {
    const base = getDefaultSignMatrixForConvention(coordConvention);
    if (!channelSignConfig) return base;
    return {
      x: { ...base.x, ...channelSignConfig.x, directionLabel: base.x.directionLabel },
      y: { ...base.y, ...channelSignConfig.y, directionLabel: base.y.directionLabel },
      z: { ...base.z, ...channelSignConfig.z, directionLabel: base.z.directionLabel },
      roll: { ...base.roll, ...channelSignConfig.roll, directionLabel: base.roll.directionLabel },
      pitch: { ...base.pitch, ...channelSignConfig.pitch, directionLabel: base.pitch.directionLabel },
      yaw: { ...base.yaw, ...channelSignConfig.yaw, directionLabel: base.yaw.directionLabel },
    };
  }, [coordConvention, channelSignConfig]);

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const dualContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingDualSplitRef = useRef<boolean>(false);

  const activeChannelKey: SixDofChannel =
    getParentSixDofChannel(varY) ||
    (SIX_DOF_CHANNELS.includes(varY as SixDofChannel) ? (varY as SixDofChannel) : 'z');
  const activeChannelRule = effectiveSignMatrix[activeChannelKey];
  const isCurrentChannelInverted =
    Boolean(invertChannels?.[activeChannelKey]) ||
    activeChannelRule?.mode === 'inverted' ||
    activeChannelRule?.multiplier === -1;

  const handleSetChannelSignMode = (ch: SixDofChannel, mode: ChannelSignMode) => {
    const baseRule = getDefaultSignMatrixForConvention(coordConvention)[ch];
    const nextMatrix: SixDofSignMatrixConfig = {
      ...effectiveSignMatrix,
      [ch]: {
        channel: ch,
        directionLabel: baseRule.directionLabel,
        mode,
        multiplier: mode === 'inverted' ? -1 : 1,
        rectify: mode === 'abs_positive' ? 'abs_positive' : 'signed',
      },
    };
    const nextInvert = {
      ...invertChannels,
      [ch]: mode === 'inverted',
    };
    updateConfig({
      channelSignConfig: nextMatrix,
      invertChannels: nextInvert,
    });
  };

  const handleApplySignConventionPreset = (convention: 'NED_Z_DOWN' | 'ENU_Z_UP') => {
    updateConfig({
      coordConvention: convention,
      channelSignConfig: getDefaultSignMatrixForConvention(convention),
      invertChannels: {},
    });
  };

  const handleToggleChannelPolarity = () => {
    const nextMode: ChannelSignMode = isCurrentChannelInverted ? 'standard' : 'inverted';
    handleSetChannelSignMode(activeChannelKey, nextMode);
  };

  const [hoveredFrame, setHoveredFrame] = useState<number | null>(null);

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];

  // Derive complete 6-channel series with reference frame t0 and gap preservation
  const { points: derivedPoints, referenceStep } = useMemo(() => {
    if (!activeTrack || !activeTrack.steps || activeTrack.steps.length === 0) {
      return { points: [] as DerivedGraphPoint[], referenceStep: null };
    }
    return deriveSixChannelSeries(activeTrack.steps, internalConfig, varX === 't');
  }, [activeTrack, internalConfig, varX]);

  // Valid finite points for curve fitting & domain calculation
  const validPlotPoints = useMemo(() => {
    return derivedPoints.filter(
      (p) =>
        p.observationStatus !== 'missing' &&
        p.observationStatus !== 'rejected' &&
        p.xVal !== null &&
        p.yActive !== null &&
        Number.isFinite(p.xVal) &&
        Number.isFinite(p.yActive)
    ) as (DerivedGraphPoint & { xVal: number; yActive: number })[];
  }, [derivedPoints]);

  // Compute least-squares curve fit (for single/overlay view)
  const fitResult: FitResult | null = useMemo(() => {
    if (fitType === 'none' || validPlotPoints.length < 2) return null;
    const xyPairs = validPlotPoints.map((p) => ({ x: p.xVal, y: p.yActive }));
    if (fitType === 'linear' && xyPairs.length >= 2) return fitLinear(xyPairs);
    if (fitType === 'parabolic' && xyPairs.length >= 3) return fitParabolic(xyPairs);
    if (fitType === 'cubic' && xyPairs.length >= 4) return fitCubic(xyPairs);
    return null;
  }, [fitType, validPlotPoints]);

  // Attach fitted values to derivedPoints
  const chartData = useMemo(() => {
    return derivedPoints.map((p) => {
      let fitY: number | null = null;
      if (fitResult && p.xVal !== null && Number.isFinite(p.xVal)) {
        const x = p.xVal;
        if (fitResult.type === 'linear' && fitResult.params.slope !== undefined) {
          fitY = fitResult.params.slope * x + fitResult.params.intercept;
        } else if (fitResult.type === 'parabolic' && fitResult.params.A !== undefined) {
          fitY = fitResult.params.A * x * x + fitResult.params.B * x + fitResult.params.C;
        } else if (fitResult.type === 'cubic' && fitResult.params.A !== undefined) {
          fitY =
            fitResult.params.A * Math.pow(x, 3) +
            fitResult.params.B * Math.pow(x, 2) +
            fitResult.params.C * x +
            fitResult.params.D;
        }
      }
      return {
        ...p,
        fitY: fitY !== null && Number.isFinite(fitY) ? Number(fitY.toFixed(5)) : null,
      };
    });
  }, [derivedPoints, fitResult]);

  // Active point at currentFrame, reference t0 point, or hoveredFrame
  const activePoint = useMemo(() => {
    return chartData.find((p) => p.frame === currentFrame) || null;
  }, [chartData, currentFrame]);

  const referenceT0Point = useMemo(() => {
    return chartData.find((p) => p.isReferenceT0) || null;
  }, [chartData]);

  const inspectedPoint = useMemo(() => {
    if (hoveredFrame !== null) {
      const found = chartData.find((p) => p.frame === hoveredFrame);
      if (found) return found;
    }
    return activePoint;
  }, [chartData, hoveredFrame, activePoint]);

  // Horizontal X bounds for manual zoom & pan
  const dataBoundsX = useMemo((): [number, number] => {
    const xs = chartData
      .map((p) => p.xVal)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (xs.length === 0) return [0, 1];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return minX === maxX ? [minX - 1, maxX + 1] : [minX, maxX];
  }, [chartData]);

  const handleZoomX = (factor: number) => {
    const [curMin, curMax] = zoomDomainX || dataBoundsX;
    const center = (curMin + curMax) / 2;
    const halfSpan = ((curMax - curMin) / 2) * factor;
    if (halfSpan < 1e-6) return;
    updateConfig({
      zoomDomainX: [Number((center - halfSpan).toFixed(5)), Number((center + halfSpan).toFixed(5))],
    });
  };

  const handlePanX = (direction: -1 | 1) => {
    const [curMin, curMax] = zoomDomainX || dataBoundsX;
    const shift = (curMax - curMin) * 0.2 * direction;
    updateConfig({
      zoomDomainX: [Number((curMin + shift).toFixed(5)), Number((curMax + shift).toFixed(5))],
    });
  };

  const handleResetZoom = () => {
    updateConfig({ zoomDomainX: null, zoomDomainY: null });
  };

  const handleSwapAxes = () => {
    const swapped = swapGraphAxes(varX, varY);
    const prevYTransform: 'signed' | 'abs' = transformMode === 'abs' ? 'abs' : 'signed';
    const prevXTransform: 'signed' | 'abs' = transformModeX === 'abs' ? 'abs' : 'signed';
    updateConfig({
      varX: swapped.varX,
      varY: swapped.varY,
      transformMode: prevXTransform,
      transformModeX: prevYTransform,
      zoomDomainX: null,
      zoomDomainY: null,
    });
  };

  const handleToggleChannelInMultiStack = (ch: SixDofChannel) => {
    const exists = selectedChannels.includes(ch);
    const next = exists
      ? selectedChannels.length > 1
        ? selectedChannels.filter((c) => c !== ch)
        : selectedChannels
      : [...selectedChannels, ch];
    updateConfig({ selectedChannels: next });
  };

  // Axis labels & units
  const xUnit = getChannelUnit(varX, angleUnit);
  const yUnit = getChannelUnit(varY, angleUnit);
  const xLabel = getChannelLabel(
    varX,
    transformModeX || 'signed',
    useRelativeTime && varX === 't' ? true : relativeToOrigin,
    angleUnit
  );
  const ySignedLabel = getChannelLabel(varY, 'signed', relativeToOrigin, angleUnit);
  const effectivePanel2Mode = !isVectorOrPathTransformAllowed(varY, panel2TransformMode)
    ? 'abs'
    : panel2TransformMode;
  const yDistanceLabel = getChannelLabel(varY, effectivePanel2Mode, relativeToOrigin, angleUnit);
  const yActiveLabel = getChannelLabel(varY, transformMode, relativeToOrigin, angleUnit);

  // Selected multi-stack channels split by physical unit family so incompatible units never share one scale
  const selectedTranslationalChannels = selectedChannels.filter((c) =>
    TRANSLATIONAL_CHANNELS.includes(c)
  );
  const selectedRotationalChannels = selectedChannels.filter((c) =>
    ROTATIONAL_CHANNELS.includes(c)
  );

  // Custom dot renderer distinguishing Observed (solid circle), Interpolated (hollow diamond), and Reference t0 (target ring)
  const renderCustomDot = (color: string) => (props: any): React.ReactElement<SVGElement> => {
    const { cx, cy, payload, index } = props;
    const dotKey = props?.key ?? `dot-${color}-${index ?? 'idx'}-${payload?.frame ?? 'na'}`;

    if (cx === undefined || cy === undefined || !payload) {
      return <g key={dotKey} />;
    }
    if (
      payload.observationStatus === 'missing' ||
      payload.observationStatus === 'rejected'
    ) {
      return <g key={dotKey} />;
    }

    if (payload.isReferenceT0) {
      return (
        <g key={dotKey}>
          <circle
            cx={cx}
            cy={cy}
            r={5.5}
            fill="#ffffff"
            stroke="#dc2626"
            strokeWidth={2}
          />
          <circle cx={cx} cy={cy} r={2.5} fill="#dc2626" />
        </g>
      );
    }

    if (payload.observationStatus === 'interpolated') {
      // Hollow diamond marker for temporally interpolated observations
      return (
        <polygon
          key={dotKey}
          points={`${cx},${cy - 4.5} ${cx + 4.5},${cy} ${cx},${cy + 4.5} ${cx - 4.5},${cy}`}
          fill="#ffffff"
          stroke="#d97706"
          strokeWidth={1.5}
        />
      );
    }

    return (
      <circle
        key={dotKey}
        cx={cx}
        cy={cy}
        r={3}
        fill={color}
        stroke="#0f172a"
        strokeWidth={0.8}
      />
    );
  };

  // Available frames for t0 selector
  const availableFrames = useMemo(() => {
    if (!activeTrack?.steps) return [];
    return [...activeTrack.steps]
      .filter((s) => !s.rejected)
      .sort((a, b) => a.frame - b.frame);
  }, [activeTrack]);

  const effectiveT0Frame = referenceStep?.frame ?? (availableFrames[0]?.frame ?? 0);
  const effectiveT0Time = referenceStep?.time ?? 0;

  // Export Vector SVG
  const handleExportSVG = (themeOverride?: PublicationPlotTheme) => {
    const svgString = renderPublicationPlotSVG(
      activeTrack,
      internalConfig,
      derivedPoints,
      themeOverride || publicationTheme
    );
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTrack?.name || 'telemetry'}_${varY}_vs_${varX}_${
      themeOverride || publicationTheme
    }.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  // Export High-Resolution PNG (300 DPI rasterization from Vector SVG)
  const handleExportPNG300DPI = (themeOverride?: PublicationPlotTheme) => {
    const chosenTheme = themeOverride || publicationTheme;
    const svgString = renderPublicationPlotSVG(
      activeTrack,
      internalConfig,
      derivedPoints,
      chosenTheme
    );
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 3.125; // ~300 DPI equivalent (3750 x 2562 px)
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(1200 * scale);
      canvas.height = Math.round(820 * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, 1200, 820);
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${activeTrack?.name || 'telemetry'}_${varY}_vs_${varX}_${chosenTheme}_300dpi.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
    setIsExportMenuOpen(false);
  };

  // Dual-panel horizontal splitter drag handler
  const handleStartDualSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingDualSplitRef.current = true;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingDualSplitRef.current || !dualContainerRef.current) return;
      const rect = dualContainerRef.current.getBoundingClientRect();
      if (rect.height <= 0) return;
      const relY = moveEvent.clientY - rect.top;
      const pct = Math.max(15, Math.min(85, Math.round((relY / rect.height) * 100)));
      updateConfig({ dualGraphSplitPct: pct });
    };
    const handleMouseUp = () => {
      isDraggingDualSplitRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div id="plot-view-container" className="flex flex-col h-full bg-white text-xs select-none relative overflow-hidden">
      {/* ======================== BAR 1: SINGLE COMPACT GRAPH HEADER BAR (32px, #F1F3F5) ======================== */}
      <div className="h-[32px] bg-[#F1F3F5] border-b border-[#DEE2E6] px-2 flex items-center justify-between gap-1.5 shrink-0">
        {/* Left: Plot Mode Tabs + Y-Axis Select + Swap + X-Axis Select */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
          <div
            id="plot-layout-mode-group"
            className="flex items-center border border-[#CBD5E1] rounded-[3px] bg-[#E2E8F0] p-0.5 h-[24px] shrink-0"
          >
            <button
              id="btn-layout-dual-sync"
              type="button"
              onClick={() => updateConfig({ viewMode: 'dual-sync' })}
              className={`px-2 h-[20px] rounded-[2px] text-[10.5px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'dual-sync'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
              }`}
              title="Synchronized Dual Panels — Panel 1 Signed Position/Displacement, Panel 2 Non-Negative Distance"
            >
              <SplitSquareVertical className="w-3 h-3" />
              <span>Dual Sync</span>
            </button>

            <button
              id="btn-layout-overlay"
              type="button"
              onClick={() => updateConfig({ viewMode: 'overlay' })}
              className={`px-2 h-[20px] rounded-[2px] text-[10.5px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'overlay'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
              }`}
              title="Overlay Signed Displacement and Non-Negative Distance on the same graph"
            >
              <Layers className="w-3 h-3" />
              <span>Overlay</span>
            </button>

            <button
              id="btn-layout-single"
              type="button"
              onClick={() => updateConfig({ viewMode: 'single' })}
              className={`px-2 h-[20px] rounded-[2px] text-[10.5px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'single'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
              }`}
              title="Single Configurable Plot (supports any X vs Y combination and curve fitting)"
            >
              <BarChart2 className="w-3 h-3" />
              <span>Single/XY</span>
            </button>

            <button
              id="btn-layout-multi-stack"
              type="button"
              onClick={() => updateConfig({ viewMode: 'multi-stack' })}
              className={`px-2 h-[20px] rounded-[2px] text-[10.5px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'multi-stack'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
              }`}
              title="Synchronized Multi-Channel Stack separated by physical unit family"
            >
              <Activity className="w-3 h-3" />
              <span>Stack</span>
            </button>

            <button
              id="btn-layout-6dof-grid"
              type="button"
              onClick={() => updateConfig({ viewMode: 'telemetry-6dof' })}
              className={`px-2 h-[20px] rounded-[2px] text-[10.5px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'telemetry-6dof'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
              }`}
              title="6-DOF Telemetry Grid showing all six channels (X, Y, Z, Roll, Pitch, Yaw)"
            >
              <Grid3X3 className="w-3 h-3" />
              <span>6-DOF Grid</span>
            </button>
          </div>

          {/* Y-Axis Select + Y ± / |q| Quick Toggles + Swap + X-Axis Select + X ± / |q| Quick Toggles + Presets */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-0.5 bg-white border border-[#CBD5E1] rounded-[3px] px-1 h-[24px]">
              <span className="text-[10px] font-mono font-bold text-[#2563EB]">Y:</span>
              <select
                id="plot-y-var-select"
                value={varY}
                onChange={(e) => updateConfig({ varY: e.target.value as PlotVariable })}
                className="bg-transparent text-[#1E293B] font-semibold focus:outline-none cursor-pointer text-[11px] max-w-[118px] truncate"
                title="Select Vertical (Y) Axis Channel"
              >
                <optgroup label="Translational Channels (m)">
                  <option value="x">X Displacement (m)</option>
                  <option value="y">Y Displacement (m)</option>
                  <option value="z">Z Displacement (m)</option>
                </optgroup>
                <optgroup label="Rotational Channels (Attitude)">
                  <option value="roll">Roll φ ({angleUnit === 'rad' ? 'rad' : '°'})</option>
                  <option value="pitch">Pitch θ ({angleUnit === 'rad' ? 'rad' : '°'})</option>
                  <option value="yaw">Yaw ψ ({angleUnit === 'rad' ? 'rad' : '°'})</option>
                </optgroup>
                <optgroup label="Angular Rates & Acceleration">
                  <option value="omegaRoll">ω_Roll ({angleUnit === 'rad' ? 'rad/s' : '°/s'})</option>
                  <option value="omegaPitch">ω_Pitch ({angleUnit === 'rad' ? 'rad/s' : '°/s'})</option>
                  <option value="omegaYaw">ω_Yaw ({angleUnit === 'rad' ? 'rad/s' : '°/s'})</option>
                  <option value="alphaRoll">α_Roll ({angleUnit === 'rad' ? 'rad/s²' : '°/s²'})</option>
                  <option value="alphaPitch">α_Pitch ({angleUnit === 'rad' ? 'rad/s²' : '°/s²'})</option>
                  <option value="alphaYaw">α_Yaw ({angleUnit === 'rad' ? 'rad/s²' : '°/s²'})</option>
                </optgroup>
                <optgroup label="Derived Distance & Path Metrics (m)">
                  <option value="distX">|ΔX(t)| Distance (m)</option>
                  <option value="distY">|ΔY(t)| Distance (m)</option>
                  <option value="distZ">|ΔZ(t)| Distance (m)</option>
                  <option value="slantRange">D₃D(t) 3D Magnitude (m)</option>
                  <option value="pathLength">L(t) Path Length (m)</option>
                </optgroup>
                <optgroup label="Time">
                  <option value="t">t Relative Time (s)</option>
                </optgroup>
                <optgroup label="3D Velocity & Acceleration">
                  <option value="vx">vx Velocity (m/s)</option>
                  <option value="vy">vy Velocity (m/s)</option>
                  <option value="vz">vz Velocity (m/s)</option>
                  <option value="v">v 3D Speed (m/s)</option>
                  <option value="ax">ax Accel (m/s²)</option>
                  <option value="ay">ay Accel (m/s²)</option>
                  <option value="az">az Accel (m/s²)</option>
                  <option value="a">a 3D Accel (m/s²)</option>
                </optgroup>
                <optgroup label="Ballistics & Mechanical Energy">
                  <option value="mach">Mach Number (M)</option>
                  <option value="gForce">G-Force (g)</option>
                  <option value="kineticEnergy">Kinetic Energy K (J)</option>
                  <option value="potentialEnergy">Potential Energy U (J)</option>
                  <option value="totalEnergy">Total Energy E (J)</option>
                </optgroup>
              </select>

              <button
                id="btn-quick-invert-y"
                type="button"
                onClick={handleToggleChannelPolarity}
                className={`px-1 h-[18px] rounded-[2px] font-mono text-[10px] font-bold transition-colors ${
                  isCurrentChannelInverted
                    ? 'bg-[#DC2626] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                }`}
                title={`Invert Y Channel (${activeChannelKey.toUpperCase()}) Polarity (±)`}
              >
                ±
              </button>

              <button
                id="btn-quick-abs-y"
                type="button"
                onClick={() =>
                  updateConfig({
                    transformMode:
                      transformMode === 'abs' || activeChannelRule?.mode === 'abs_positive'
                        ? 'signed'
                        : 'abs',
                  })
                }
                className={`px-1 h-[18px] rounded-[2px] font-mono text-[10px] font-bold transition-colors ${
                  transformMode === 'abs' || activeChannelRule?.mode === 'abs_positive'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                }`}
                title="Toggle Positive Signed Rectification |Δq(t)| (Abs) on Vertical Y Axis"
              >
                |q|
              </button>
            </div>

            <button
              id="btn-swap-axes"
              type="button"
              onClick={handleSwapAxes}
              className="px-1.5 h-[24px] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] rounded-[3px] text-[11px] font-semibold text-[#1E293B] flex items-center justify-center transition-colors shrink-0"
              title="Swap Horizontal (X) and Vertical (Y) Graph Axes"
            >
              <ArrowLeftRight className="w-3 h-3 text-[#2563EB]" />
            </button>

            <div className="flex items-center gap-0.5 bg-white border border-[#CBD5E1] rounded-[3px] px-1 h-[24px]">
              <span className="text-[10px] font-mono font-bold text-[#475569]">X:</span>
              <select
                id="plot-x-var-select"
                value={varX}
                onChange={(e) =>
                  updateConfig({
                    varX: e.target.value as GraphAxisVariable,
                    zoomDomainX: null,
                  })
                }
                className="bg-transparent text-[#1E293B] font-semibold focus:outline-none cursor-pointer text-[11px] max-w-[104px] truncate"
                title="Select Horizontal (X) Axis Variable (supports Time or any 6-DOF / Kinematic channel)"
              >
                <optgroup label="Time">
                  <option value="t">Time Δt (s)</option>
                </optgroup>
                <optgroup label="Translational Channels (m)">
                  <option value="x">X Displacement (m)</option>
                  <option value="y">Y Displacement (m)</option>
                  <option value="z">Z Displacement (m)</option>
                </optgroup>
                <optgroup label="Rotational Channels (Attitude)">
                  <option value="roll">Roll φ ({angleUnit === 'rad' ? 'rad' : '°'})</option>
                  <option value="pitch">Pitch θ ({angleUnit === 'rad' ? 'rad' : '°'})</option>
                  <option value="yaw">Yaw ψ ({angleUnit === 'rad' ? 'rad' : '°'})</option>
                </optgroup>
                <optgroup label="Angular Rates & Acceleration">
                  <option value="omegaRoll">ω_Roll ({angleUnit === 'rad' ? 'rad/s' : '°/s'})</option>
                  <option value="omegaPitch">ω_Pitch ({angleUnit === 'rad' ? 'rad/s' : '°/s'})</option>
                  <option value="omegaYaw">ω_Yaw ({angleUnit === 'rad' ? 'rad/s' : '°/s'})</option>
                  <option value="alphaRoll">α_Roll ({angleUnit === 'rad' ? 'rad/s²' : '°/s²'})</option>
                  <option value="alphaPitch">α_Pitch ({angleUnit === 'rad' ? 'rad/s²' : '°/s²'})</option>
                  <option value="alphaYaw">α_Yaw ({angleUnit === 'rad' ? 'rad/s²' : '°/s²'})</option>
                </optgroup>
                <optgroup label="Derived Distance & Path Metrics (m)">
                  <option value="distX">|ΔX(t)| Distance (m)</option>
                  <option value="distY">|ΔY(t)| Distance (m)</option>
                  <option value="distZ">|ΔZ(t)| Distance (m)</option>
                  <option value="slantRange">D₃D(t) 3D Magnitude (m)</option>
                  <option value="pathLength">L(t) Path Length (m)</option>
                </optgroup>
                <optgroup label="3D Velocity & Acceleration">
                  <option value="vx">vx Velocity (m/s)</option>
                  <option value="vy">vy Velocity (m/s)</option>
                  <option value="vz">vz Velocity (m/s)</option>
                  <option value="v">v 3D Speed (m/s)</option>
                  <option value="ax">ax Accel (m/s²)</option>
                  <option value="ay">ay Accel (m/s²)</option>
                  <option value="az">az Accel (m/s²)</option>
                  <option value="a">a 3D Accel (m/s²)</option>
                </optgroup>
                <optgroup label="Ballistics & Mechanical Energy">
                  <option value="mach">Mach Number (M)</option>
                  <option value="gForce">G-Force (g)</option>
                  <option value="kineticEnergy">Kinetic Energy K (J)</option>
                  <option value="potentialEnergy">Potential Energy U (J)</option>
                  <option value="totalEnergy">Total Energy E (J)</option>
                </optgroup>
              </select>

              <button
                id="btn-quick-invert-x"
                type="button"
                onClick={() => updateConfig({ invertVarX: !invertVarX, zoomDomainX: null })}
                className={`px-1 h-[18px] rounded-[2px] font-mono text-[10px] font-bold transition-colors ${
                  invertVarX
                    ? 'bg-[#DC2626] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                }`}
                title="Invert Horizontal (X) Axis Sign (±)"
              >
                ±
              </button>

              <button
                id="btn-quick-abs-x"
                type="button"
                onClick={() =>
                  updateConfig({
                    transformModeX: transformModeX === 'abs' ? 'signed' : 'abs',
                    zoomDomainX: null,
                  })
                }
                className={`px-1 h-[18px] rounded-[2px] font-mono text-[10px] font-bold transition-colors ${
                  transformModeX === 'abs'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                }`}
                title="Toggle Positive Magnitude |q| on Horizontal (X) Axis"
              >
                |q|
              </button>
            </div>

            {/* Quick Research Plot Presets Selector */}
            <div className="hidden sm:flex items-center bg-white border border-[#CBD5E1] rounded-[3px] px-1 h-[24px]">
              <select
                id="research-plot-preset-select"
                value=""
                onChange={(e) => {
                  const preset = RESEARCH_PLOT_PRESETS.find((p) => p.id === e.target.value);
                  if (preset) {
                    updateConfig(preset.configUpdates);
                  }
                }}
                className="bg-transparent text-[#1E293B] font-semibold focus:outline-none cursor-pointer text-[10.5px] max-w-[118px] truncate"
                title="Quick Research Plot Presets (1-Click Aerospace & Parametric Plots)"
              >
                <option value="" disabled>
                  Presets...
                </option>
                {RESEARCH_PLOT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id} title={preset.description}>
                    {preset.shortLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right: Active 6-DOF Quick Pills (X Y Z R P Y) + Parameters & Filter Popover Button + Export + Zoom */}
        <div className="flex items-center gap-1 shrink-0">
          <div
            id="six-channel-selector-bar"
            className="flex items-center border border-[#CBD5E1] rounded-[3px] bg-white p-0.5 gap-0.5 h-[24px]"
          >
            {SIX_DOF_CHANNELS.map((ch) => {
              const isSelected =
                viewMode === 'multi-stack' ? selectedChannels.includes(ch) : varY === ch;
              const info = CHANNEL_DISPLAY_NAMES[ch];
              const shortChar =
                ch === 'roll' ? 'R' : ch === 'pitch' ? 'P' : ch === 'yaw' ? 'Y' : info.short;
              return (
                <button
                  key={ch}
                  id={`btn-channel-${ch}`}
                  type="button"
                  onClick={() => {
                    if (viewMode === 'multi-stack') {
                      handleToggleChannelInMultiStack(ch);
                    } else {
                      updateConfig({ varY: ch });
                    }
                  }}
                  className={`px-1.5 h-[18px] rounded-[2px] text-[10.5px] font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#334155] hover:bg-[#F1F5F9]'
                  }`}
                  title={`${info.full} (${info.axis})`}
                >
                  {shortChar}
                </button>
              );
            })}
          </div>

          <button
            id="btn-toggle-graph-settings-drawer"
            type="button"
            onClick={() => updateConfig({ showSettingsDrawer: !showSettingsDrawer })}
            className={`px-2 h-[24px] rounded-[3px] border text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
              showSettingsDrawer
                ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F8FAFC]'
            }`}
            title="Open Floating Parameters & Filter Inspector (Transform Mode, t0 Tare, NED/ENU Frame, Virtual Points, Savitzky-Golay / Butterworth Filter)"
          >
            <Sliders className="w-3 h-3" />
            <span>Parameters &amp; Filter</span>
          </button>

          {/* 1-Click Publication Plot Exporter */}
          <div className="relative">
            <button
              id="btn-export-publication-plot"
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="px-2 h-[24px] rounded-[3px] bg-white hover:bg-[#F8FAFC] text-[#1E293B] border border-[#CBD5E1] text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Export Publication-Grade Figure (High-Res 300 DPI PNG or Vector SVG in IEEE Light or Tactical Dark theme)"
            >
              <Download className="w-3 h-3 text-[#2563EB]" />
              <span>Export</span>
            </button>

            <div
              id="publication-export-popover"
              className={`${
                isExportMenuOpen ? 'block' : 'hidden'
              } absolute right-0 top-full mt-1 w-72 bg-white border border-[#CBD5E1] rounded-[3px] shadow-2xl p-2.5 z-50 text-[11px] text-[#1E293B]`}
            >
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#E2E8F0]">
                <span className="font-bold text-[#0F172A]">Publication Figure Exporter</span>
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen(false)}
                  className="p-0.5 hover:bg-[#F1F5F9] rounded-[2px]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mb-2.5">
                <div className="font-semibold text-[10px] text-[#64748B] mb-1">
                  Select Figure Theme:
                </div>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 cursor-pointer p-1 rounded-[2px] hover:bg-[#F8FAFC]">
                    <input
                      type="radio"
                      name="pub-theme"
                      checked={publicationTheme === 'publication-light'}
                      onChange={() => updateConfig({ publicationTheme: 'publication-light' })}
                    />
                    <span className="font-semibold">
                      Publication Light (IEEE / Defense Report)
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer p-1 rounded-[2px] hover:bg-[#F8FAFC]">
                    <input
                      type="radio"
                      name="pub-theme"
                      checked={publicationTheme === 'tactical-dark'}
                      onChange={() => updateConfig({ publicationTheme: 'tactical-dark' })}
                    />
                    <span className="font-semibold">Tactical Dark (Workstation HUD)</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <button
                  id="btn-download-plot-png-300dpi"
                  type="button"
                  onClick={() => handleExportPNG300DPI(publicationTheme)}
                  className="w-full py-1.5 px-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-[3px] flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export High-Res PNG (300 DPI)</span>
                </button>
                <button
                  id="btn-download-plot-svg"
                  type="button"
                  onClick={() => handleExportSVG(publicationTheme)}
                  className="w-full py-1.5 px-2 bg-[#1E293B] hover:bg-[#0F172A] text-white font-semibold rounded-[3px] flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Vector SVG (Scalable)</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center bg-white border border-[#CBD5E1] rounded-[3px] p-0.5 h-[24px]">
            <button
              id="btn-zoom-in"
              type="button"
              onClick={() => handleZoomX(0.75)}
              className="p-0.5 hover:bg-[#F1F5F9] text-[#1E293B] rounded-[2px]"
              title="Zoom In Horizontal Axis"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              id="btn-zoom-out"
              type="button"
              onClick={() => handleZoomX(1.35)}
              className="p-0.5 hover:bg-[#F1F5F9] text-[#1E293B] rounded-[2px]"
              title="Zoom Out Horizontal Axis"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              id="btn-pan-left"
              type="button"
              onClick={() => handlePanX(-1)}
              className="p-0.5 hover:bg-[#F1F5F9] text-[#1E293B] rounded-[2px]"
              title="Pan Left"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              id="btn-pan-right"
              type="button"
              onClick={() => handlePanX(1)}
              className="p-0.5 hover:bg-[#F1F5F9] text-[#1E293B] rounded-[2px]"
              title="Pan Right"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              id="btn-reset-zoom"
              type="button"
              onClick={handleResetZoom}
              className="px-1 hover:bg-[#F1F5F9] text-[#1E293B] font-semibold text-[10px] flex items-center gap-0.5 rounded-[2px] whitespace-nowrap"
              title="Zoom to Fit / Reset Graph View"
            >
              <Maximize2 className="w-2.5 h-2.5" />
              <span>Fit</span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================== BAR 2: ULTRA-SLIM TELEMETRY CONTEXT STRIP (22px, 11px Monospace) ======================== */}
      <div className="h-[22px] bg-[#F8FAFC] border-b border-[#DEE2E6] px-2.5 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#1E293B] shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <button
            type="button"
            onClick={() => updateConfig({ showSettingsDrawer: !showSettingsDrawer })}
            className="hover:text-[#2563EB] transition-colors cursor-pointer"
            title="Click to configure Reference Frame"
          >
            Frame: <strong className="text-[#0F172A]">{referenceFrameMode.replace(/_/g, ' ')}</strong>
          </button>
          <span className="text-[#CBD5E1]">|</span>
          <button
            type="button"
            onClick={() => updateConfig({ showSettingsDrawer: !showSettingsDrawer })}
            className="hover:text-[#2563EB] transition-colors cursor-pointer"
            title="Click to open 6-DOF Sign & Direction Matrix (Missile NED vs Cartesian ENU)"
          >
            Axes:{' '}
            <strong className="text-[#0F172A]">
              {formatSignMatrixSummary(coordConvention, channelSignConfig, invertChannels, true)}
            </strong>
          </button>
          <span className="text-[#CBD5E1]">|</span>
          <button
            type="button"
            onClick={() => updateConfig({ showSettingsDrawer: !showSettingsDrawer })}
            className="hover:text-[#2563EB] transition-colors cursor-pointer"
            title="Click to select Active Virtual Critical Point"
          >
            VP:{' '}
            <strong className="text-[#0F172A]">
              {(
                activeTrack?.virtualPointsCatalog || [
                  { id: 'vp-cg', name: 'Missile CG' },
                  { id: 'vp-nose', name: 'Nose Tip' },
                  { id: 'vp-fin-upper', name: 'Aft Upper Fin Tip' },
                  { id: 'vp-tail', name: 'Tail Boattail' },
                ]
              ).find((v) => v.id === (activeVirtualPointId || 'vp-cg'))?.name || 'Missile CG'}
            </strong>
          </button>
          <span className="text-[#CBD5E1]">|</span>
          <span className="flex items-center gap-1">
            <span>
              t0: <strong className="text-[#0F172A]">F#{effectiveT0Frame} ({effectiveT0Time.toFixed(3)}s)</strong>
            </span>
            <button
              type="button"
              onClick={() =>
                updateConfig({
                  referenceFrameT0: currentFrame,
                  relativeToOrigin: true,
                  useRelativeTime: true,
                })
              }
              className="px-1 bg-[#E2E8F0] hover:bg-[#2563EB] hover:text-white text-[#1E293B] rounded-[2px] text-[10px] font-semibold transition-colors"
              title="Tare / Re-zero telemetry to current video frame"
            >
              [Set t0]
            </button>
          </span>
          <span className="text-[#CBD5E1]">|</span>
          <button
            type="button"
            onClick={() => updateConfig({ showSettingsDrawer: !showSettingsDrawer })}
            className="hover:text-[#2563EB] transition-colors cursor-pointer"
            title="Click to configure Savitzky-Golay or Butterworth signal filter"
          >
            Filter:{' '}
            <strong className="text-[#0F172A]">
              {filterConfig?.type === 'savgol'
                ? `SG(${filterConfig.windowSize || 7})`
                : filterConfig?.type === 'butterworth'
                ? `BW(${filterConfig.cutoffHz || 45}Hz)`
                : 'Raw'}
            </strong>
          </button>
          <span className="text-[#CBD5E1]">|</span>
          <button
            type="button"
            onClick={() => updateConfig({ showUncertaintyBand: !showUncertaintyBand })}
            className="hover:text-[#2563EB] transition-colors cursor-pointer"
            title="Toggle ±1σ SE(3) Adjoint Pose Covariance Uncertainty Band"
          >
            ±1σ Band: <strong className="text-[#0F172A]">{showUncertaintyBand ? 'ON' : 'OFF'}</strong>
          </button>

          {activeTrack?.overallMinClearance && (
            <>
              <span className="text-[#CBD5E1]">|</span>
              <button
                id="badge-min-store-clearance"
                type="button"
                onClick={() => onSelectFrame(activeTrack.overallMinClearance!.closestApproachFrame)}
                className="text-[#D97706] hover:underline font-semibold cursor-pointer"
                title="Minimum Store-to-Pylon Clearance Envelope — Click to jump to Frame of Closest Approach"
              >
                Min Clear: {(activeTrack.overallMinClearance.minDistanceMeters * 1000).toFixed(1)}mm @F#
                {activeTrack.overallMinClearance.closestApproachFrame}
              </button>
            </>
          )}
        </div>

        {/* Live Cursor Readout on Right */}
        <div className="hidden xl:flex items-center gap-1.5 whitespace-nowrap text-[10.5px] text-[#475569]">
          {inspectedPoint ? (
            <>
              <span>
                F#{inspectedPoint.frame} ({inspectedPoint.relTime?.toFixed(3) ?? '0.000'}s)
              </span>
              <span>·</span>
              <span>
                Signed:{' '}
                <strong className="text-[#0F172A]">
                  {inspectedPoint.ySigned !== null ? inspectedPoint.ySigned.toFixed(4) : 'GAP'} {yUnit}
                </strong>
              </span>
              <span>·</span>
              <span>
                |{varY.toUpperCase()}|:{' '}
                <strong className="text-[#2563EB]">
                  {inspectedPoint.yAbs !== null ? inspectedPoint.yAbs.toFixed(4) : 'GAP'} {yUnit}
                </strong>
              </span>
              {inspectedPoint.rmsePx !== null && (
                <>
                  <span>·</span>
                  <span>RMS: {inspectedPoint.rmsePx.toFixed(2)}px</span>
                </>
              )}
            </>
          ) : (
            <span>Hover chart to inspect</span>
          )}
        </div>
      </div>

      {/* ======================== FLOATING PARAMETERS & FILTER POPOVER OVERLAY (MOUNTED IN DOM, z-50 max-h-[75vh]) ======================== */}
      <div
        id="graph-settings-drawer"
        className={`${
          showSettingsDrawer ? 'block' : 'hidden'
        } absolute right-2 top-[56px] w-[720px] max-w-[calc(100%-16px)] max-h-[75vh] overflow-y-auto bg-white border border-[#CBD5E1] rounded-[3px] shadow-2xl p-3 z-50 text-[11px] text-[#1E293B]`}
      >
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="font-bold text-[12px] text-[#0F172A]">
              Telemetry Parameters, Reference Frame &amp; Signal Conditioning
            </span>
          </div>
          <button
            type="button"
            onClick={() => updateConfig({ showSettingsDrawer: false })}
            className="px-2 py-0.5 bg-[#F1F3F5] hover:bg-[#E2E8F0] border border-[#CBD5E1] rounded-[2px] text-[10.5px] font-semibold text-[#1E293B] flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            <span>Close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* SECTION 1: TRANSFORM MODE & ROTATIONAL / FIT OPTIONS */}
          <div className="bg-[#F8FAFC] border border-[#DEE2E6] rounded-[3px] p-2.5 flex flex-col gap-2">
            <div className="font-bold text-[#0F172A] border-b border-[#E2E8F0] pb-1">
              1. Transform Mode &amp; Curve Fit
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[#475569]">
                Position-to-Distance Transformation:
              </span>
              <div
                id="plot-transform-mode-group"
                className="grid grid-cols-2 gap-1 bg-white border border-[#CBD5E1] rounded-[3px] p-1"
              >
                <button
                  id="btn-transform-signed"
                  type="button"
                  onClick={() => updateConfig({ transformMode: 'signed' })}
                  className={`px-2 py-1 rounded-[2px] text-[10.5px] font-semibold transition-colors ${
                    transformMode === 'signed'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#1E293B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  Signed (+/-)
                </button>
                <button
                  id="btn-transform-abs"
                  type="button"
                  onClick={() => updateConfig({ transformMode: 'abs', panel2TransformMode: 'abs' })}
                  className={`px-2 py-1 rounded-[2px] text-[10.5px] font-semibold transition-colors ${
                    transformMode === 'abs'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#1E293B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  |Δq(t)| Abs
                </button>
                <button
                  id="btn-transform-magnitude"
                  type="button"
                  disabled={!isVectorOrPathTransformAllowed(varY, 'magnitude')}
                  onClick={() =>
                    updateConfig({ transformMode: 'magnitude', panel2TransformMode: 'magnitude' })
                  }
                  className={`px-2 py-1 rounded-[2px] text-[10.5px] font-semibold transition-colors ${
                    !isVectorOrPathTransformAllowed(varY, 'magnitude')
                      ? 'text-[#94A3B8] cursor-not-allowed bg-[#F8FAFC]'
                      : transformMode === 'magnitude'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#1E293B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  3D Mag D₃D(t)
                </button>
                <button
                  id="btn-transform-path-length"
                  type="button"
                  disabled={!isVectorOrPathTransformAllowed(varY, 'path_length')}
                  onClick={() =>
                    updateConfig({ transformMode: 'path_length', panel2TransformMode: 'path_length' })
                  }
                  className={`px-2 py-1 rounded-[2px] text-[10.5px] font-semibold transition-colors ${
                    !isVectorOrPathTransformAllowed(varY, 'path_length')
                      ? 'text-[#94A3B8] cursor-not-allowed bg-[#F8FAFC]'
                      : transformMode === 'path_length'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#1E293B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  Path Length L(t)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 items-center pt-1">
              <span className="font-semibold text-[#475569]">Angle Wrapping:</span>
              <div className="flex items-center gap-1">
                <select
                  id="select-angle-wrap-mode"
                  value={angleWrapMode}
                  onChange={(e) => updateConfig({ angleWrapMode: e.target.value as AngleWrapMode })}
                  className="flex-1 bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-semibold text-[#1E293B]"
                >
                  <option value="unwrapped">Unwrapped (±180° Cont.)</option>
                  <option value="shortest">Shortest [-180°,+180°]</option>
                </select>
                <button
                  id="btn-toggle-angle-unit"
                  type="button"
                  onClick={() => updateConfig({ angleUnit: angleUnit === 'deg' ? 'rad' : 'deg' })}
                  className="px-1.5 py-0.5 bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] rounded-[2px] font-mono font-bold text-[#1E293B]"
                >
                  {angleUnit === 'deg' ? 'deg' : 'rad'}
                </button>
              </div>

              <span className="font-semibold text-[#475569]">Polynomial Curve Fit:</span>
              <select
                id="plot-fit-type-select"
                value={fitType}
                onChange={(e) => updateConfig({ fitType: e.target.value as FitType })}
                className="bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-semibold text-[#1E293B]"
              >
                <option value="none">None</option>
                <option value="linear">Linear</option>
                <option value="parabolic">Parabolic</option>
                <option value="cubic">Cubic</option>
              </select>
            </div>
          </div>

          {/* SECTION 2: REFERENCE ORIGIN (t0 TARE) */}
          <div
            id="plot-t0-reference-bar"
            className="bg-[#F8FAFC] border border-[#DEE2E6] rounded-[3px] p-2.5 flex flex-col gap-2"
          >
            <div className="font-bold text-[#0F172A] border-b border-[#E2E8F0] pb-1 flex items-center justify-between">
              <span>2. Reference Origin (t₀ Tare)</span>
              <label className="flex items-center gap-1 cursor-pointer text-[10.5px] font-semibold text-[#1E293B]">
                <input
                  id="chk-relative-to-origin"
                  type="checkbox"
                  checked={relativeToOrigin}
                  onChange={(e) => updateConfig({ relativeToOrigin: e.target.checked })}
                />
                <span>Rel Δq(t)</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-1.5 items-center">
              <span className="font-semibold text-[#475569]">Reference Frame t₀:</span>
              <select
                id="select-reference-frame-t0"
                value={referenceFrameT0 === null ? 'auto' : String(referenceFrameT0)}
                onChange={(e) => {
                  const val = e.target.value;
                  updateConfig({
                    referenceFrameT0: val === 'auto' ? null : parseInt(val, 10),
                    relativeToOrigin: true,
                  });
                }}
                className="bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-mono font-semibold text-[#1E293B]"
              >
                <option value="auto">
                  Start (F#{availableFrames[0]?.frame ?? 0},{' '}
                  {availableFrames[0]?.time?.toFixed(3) ?? '0.000'}s)
                </option>
                {availableFrames.map((s) => (
                  <option key={s.frame} value={String(s.frame)}>
                    Frame #{s.frame} ({s.time.toFixed(3)}s)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <button
                id="btn-set-t0-current"
                type="button"
                onClick={() =>
                  updateConfig({
                    referenceFrameT0: currentFrame,
                    relativeToOrigin: true,
                    useRelativeTime: true,
                  })
                }
                className="flex-1 py-1 px-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[3px] text-[10.5px] font-semibold transition-colors"
              >
                Set t₀ = Current (#{currentFrame})
              </button>

              <button
                id="btn-reset-t0"
                type="button"
                onClick={() =>
                  updateConfig({
                    referenceFrameT0: null,
                    relativeToOrigin: true,
                    useRelativeTime: true,
                  })
                }
                className="py-1 px-2 bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#1E293B] rounded-[3px] text-[10.5px] font-semibold flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset t₀</span>
              </button>
            </div>
          </div>

          {/* SECTION 3: AEROSPACE FRAME & 6-DOF SIGN & DIRECTION MATRIX */}
          <div className="bg-[#F8FAFC] border border-[#DEE2E6] rounded-[3px] p-2.5 flex flex-col gap-2 md:col-span-2">
            <div className="font-bold text-[#0F172A] border-b border-[#E2E8F0] pb-1 flex flex-wrap items-center justify-between gap-2">
              <span>3. Aerospace Frame &amp; 6-DOF Missile Body Sign &amp; Direction Matrix</span>
              <div className="flex items-center gap-1">
                <button
                  id="btn-preset-missile-ned"
                  type="button"
                  onClick={() => handleApplySignConventionPreset('NED_Z_DOWN')}
                  className={`px-2 py-0.5 rounded-[2px] font-semibold border text-[10px] transition-colors ${
                    coordConvention === 'NED_Z_DOWN'
                      ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                      : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                  }`}
                  title="Aerospace Missile Body (NED: X+ Towards Nose, Y+ Towards Right, Z+ Downwards, Roll+ Right, Pitch+ Nose Up, Yaw+ Right)"
                >
                  Missile Body NED (Default)
                </button>
                <button
                  id="btn-preset-cartesian-enu"
                  type="button"
                  onClick={() => handleApplySignConventionPreset('ENU_Z_UP')}
                  className={`px-2 py-0.5 rounded-[2px] font-semibold border text-[10px] transition-colors ${
                    coordConvention === 'ENU_Z_UP'
                      ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                      : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                  }`}
                  title="Standard Cartesian / ENU (X+ Forward, Y+ Left/Up, Z+ Up)"
                >
                  Standard Cartesian (ENU)
                </button>
                <button
                  id="btn-invert-channel-polarity"
                  type="button"
                  onClick={handleToggleChannelPolarity}
                  className={`px-2 py-0.5 rounded-[2px] font-semibold border text-[10px] transition-colors ${
                    isCurrentChannelInverted
                      ? 'bg-[#DC2626] text-white border-[#B91C1C]'
                      : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                  }`}
                >
                  Invert {activeChannelKey.toUpperCase()} (±)
                  {isCurrentChannelInverted ? ' [ON]' : ''}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center pb-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#475569] whitespace-nowrap">Axes Conv:</span>
                <select
                  id="select-coord-convention"
                  value={coordConvention}
                  onChange={(e) =>
                    handleApplySignConventionPreset(e.target.value as 'ENU_Z_UP' | 'NED_Z_DOWN')
                  }
                  className="flex-1 bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-semibold text-[#1E293B]"
                >
                  <option value="NED_Z_DOWN">Aerospace NED (+Z Down)</option>
                  <option value="ENU_Z_UP">Standard ENU (+Z Up)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#475569] whitespace-nowrap">Ref Frame:</span>
                <select
                  id="select-relative-reference-frame"
                  value={referenceFrameMode}
                  onChange={(e) =>
                    updateConfig({
                      referenceFrameMode: e.target.value as
                        | 'M_wrt_L'
                        | 'M_wrt_A'
                        | 'L_wrt_A'
                        | 'camera_world',
                    })
                  }
                  className="flex-1 bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-semibold text-[#1E293B]"
                >
                  <option value="M_wrt_L">Missile rel. Launcher (M wrt L)</option>
                  <option value="M_wrt_A">Missile rel. Aircraft (M wrt A)</option>
                  <option value="L_wrt_A">Launcher rel. Aircraft (L wrt A)</option>
                  <option value="camera_world">Camera / World Frame</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#475569] whitespace-nowrap">Virtual Pt:</span>
                <select
                  id="select-virtual-critical-point"
                  value={activeVirtualPointId || 'vp-cg'}
                  onChange={(e) => updateConfig({ activeVirtualPointId: e.target.value })}
                  className="flex-1 bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-semibold text-[#1E293B]"
                >
                  {(
                    activeTrack?.virtualPointsCatalog || [
                      { id: 'vp-cg', name: 'Missile CG', x: 0, y: 0, z: 0 },
                      { id: 'vp-nose', name: 'Nose Tip', x: 1.85, y: 0, z: 0 },
                      { id: 'vp-fin-upper', name: 'Aft Upper Fin Tip', x: -1.45, y: 0.28, z: 0 },
                      { id: 'vp-tail', name: 'Tail Boattail', x: -1.6, y: 0, z: 0 },
                    ]
                  ).map((vp) => (
                    <option key={vp.id} value={vp.id}>
                      {vp.name} ({vp.x.toFixed(2)}, {vp.y.toFixed(2)}, {vp.z.toFixed(2)} m)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 6-DOF Sign & Direction Matrix Table */}
            <div className="overflow-x-auto border border-[#CBD5E1] rounded-[2px] bg-white">
              <table id="six-dof-sign-matrix-table" className="w-full text-left border-collapse text-[10.5px]">
                <thead className="bg-[#E2E8F0] text-[#0F172A] font-bold border-b border-[#CBD5E1]">
                  <tr>
                    <th className="py-1 px-2 border-r border-[#CBD5E1]">Channel</th>
                    <th className="py-1 px-2 border-r border-[#CBD5E1]">Positive (+ve) Physical Direction</th>
                    <th className="py-1 px-2 border-r border-[#CBD5E1]">Derivatives Inherited</th>
                    <th className="py-1 px-2 text-center">Active Sign &amp; Rectification Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] font-mono">
                  {(
                    [
                      { ch: 'x' as SixDofChannel, label: 'X (Forward)', derivs: 'vx, ax' },
                      { ch: 'y' as SixDofChannel, label: 'Y (Lateral)', derivs: 'vy, ay' },
                      { ch: 'z' as SixDofChannel, label: 'Z (Vertical)', derivs: 'vz, az' },
                      { ch: 'roll' as SixDofChannel, label: 'Roll (φ)', derivs: 'ω_Roll, α_Roll' },
                      { ch: 'pitch' as SixDofChannel, label: 'Pitch (θ)', derivs: 'ω_Pitch, α_Pitch' },
                      { ch: 'yaw' as SixDofChannel, label: 'Yaw (ψ)', derivs: 'ω_Yaw, α_Yaw' },
                    ] as const
                  ).map((row) => {
                    const rule = effectiveSignMatrix[row.ch];
                    const activeMode: ChannelSignMode =
                      rule?.mode === 'abs_positive'
                        ? 'abs_positive'
                        : rule?.mode === 'inverted' || invertChannels?.[row.ch]
                        ? 'inverted'
                        : 'standard';
                    return (
                      <tr key={row.ch} className="hover:bg-[#F8FAFC]">
                        <td className="py-1 px-2 font-bold text-[#0F172A] border-r border-[#E2E8F0]">
                          {row.label}
                        </td>
                        <td className="py-1 px-2 text-[#334155] font-sans border-r border-[#E2E8F0]">
                          +ve: <strong>{rule?.directionLabel}</strong>
                        </td>
                        <td className="py-1 px-2 text-[#64748B] border-r border-[#E2E8F0]">
                          {row.derivs}
                        </td>
                        <td className="py-1 px-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              id={`btn-sign-${row.ch}-standard`}
                              type="button"
                              onClick={() => handleSetChannelSignMode(row.ch, 'standard')}
                              className={`px-1.5 py-0.5 rounded-[2px] font-sans font-semibold text-[10px] border transition-colors ${
                                activeMode === 'standard'
                                  ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                                  : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                              }`}
                            >
                              Standard (+)
                            </button>
                            <button
                              id={`btn-sign-${row.ch}-inverted`}
                              type="button"
                              onClick={() => handleSetChannelSignMode(row.ch, 'inverted')}
                              className={`px-1.5 py-0.5 rounded-[2px] font-sans font-semibold text-[10px] border transition-colors ${
                                activeMode === 'inverted'
                                  ? 'bg-[#DC2626] text-white border-[#B91C1C]'
                                  : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                              }`}
                            >
                              Inverted (-)
                            </button>
                            <button
                              id={`btn-sign-${row.ch}-abs`}
                              type="button"
                              onClick={() => handleSetChannelSignMode(row.ch, 'abs_positive')}
                              className={`px-1.5 py-0.5 rounded-[2px] font-sans font-semibold text-[10px] border transition-colors ${
                                activeMode === 'abs_positive'
                                  ? 'bg-[#047857] text-white border-[#065F46]'
                                  : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                              }`}
                            >
                              Always Positive (|q|)
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 4: SIGNAL CONDITIONING & UNCERTAINTY */}
          <div className="bg-[#F8FAFC] border border-[#DEE2E6] rounded-[3px] p-2.5 flex flex-col gap-2">
            <div className="font-bold text-[#0F172A] border-b border-[#E2E8F0] pb-1 flex items-center justify-between">
              <span>4. Signal Conditioning &amp; Uncertainty</span>
              <button
                id="btn-toggle-uncertainty-band"
                type="button"
                onClick={() => updateConfig({ showUncertaintyBand: !showUncertaintyBand })}
                className={`px-2 py-0.5 rounded-[2px] font-semibold border text-[10px] transition-colors ${
                  showUncertaintyBand
                    ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                    : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                }`}
              >
                ±1σ Cov Band {showUncertaintyBand ? '[ON]' : '[OFF]'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 items-center">
              <span className="font-semibold text-[#475569]">Derivative Filter:</span>
              <select
                id="select-signal-filter-type"
                value={filterConfig?.type || 'raw'}
                onChange={(e) =>
                  updateConfig({
                    filterConfig: {
                      ...(filterConfig || { windowSize: 7, polyOrder: 2, cutoffHz: 45 }),
                      type: e.target.value as 'raw' | 'savgol' | 'butterworth',
                    },
                  })
                }
                className="bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-semibold text-[#1E293B]"
              >
                <option value="raw">Raw (Unfiltered)</option>
                <option value="savgol">Savitzky-Golay Polynomial Smooth</option>
                <option value="butterworth">Zero-Phase 4th-Order Butterworth LP</option>
              </select>

              {filterConfig?.type === 'savgol' && (
                <>
                  <span className="font-semibold text-[#475569]">SG Window &amp; Order:</span>
                  <div className="flex items-center gap-1">
                    <select
                      id="select-savgol-window"
                      value={filterConfig.windowSize || 7}
                      onChange={(e) =>
                        updateConfig({
                          filterConfig: {
                            ...filterConfig,
                            windowSize: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="flex-1 bg-white border border-[#CBD5E1] rounded-[2px] px-1 py-0.5 font-mono font-semibold text-[#1E293B]"
                    >
                      <option value={5}>5 pts</option>
                      <option value={7}>7 pts</option>
                      <option value={9}>9 pts</option>
                      <option value={11}>11 pts</option>
                      <option value={15}>15 pts</option>
                      <option value={21}>21 pts</option>
                    </select>
                    <select
                      id="select-savgol-order"
                      value={filterConfig.polyOrder || 2}
                      onChange={(e) =>
                        updateConfig({
                          filterConfig: {
                            ...filterConfig,
                            polyOrder: parseInt(e.target.value, 10) as 2 | 3,
                          },
                        })
                      }
                      className="bg-white border border-[#CBD5E1] rounded-[2px] px-1 py-0.5 font-mono font-semibold text-[#1E293B]"
                    >
                      <option value={2}>Poly 2</option>
                      <option value={3}>Poly 3</option>
                    </select>
                  </div>
                </>
              )}

              {filterConfig?.type === 'butterworth' && (
                <>
                  <span className="font-semibold text-[#475569]">Cutoff Frequency (Hz):</span>
                  <div className="flex items-center gap-1">
                    <input
                      id="input-butterworth-cutoff"
                      type="number"
                      min={1}
                      max={500}
                      step={5}
                      value={filterConfig.cutoffHz || 45}
                      onChange={(e) =>
                        updateConfig({
                          filterConfig: {
                            ...filterConfig,
                            cutoffHz: Math.max(1, parseFloat(e.target.value) || 45),
                          },
                        })
                      }
                      className="w-20 bg-white border border-[#CBD5E1] rounded-[2px] px-1.5 py-0.5 font-mono font-semibold text-[#1E293B]"
                    />
                    <span className="font-mono text-[#475569]">Hz</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Regression Fit Compact Strip (only when curve fit is active) */}
      {(viewMode === 'single' || viewMode === 'overlay') && fitResult && fitType !== 'none' && (
        <div className="bg-[#F1F5F9] border-b border-[#DEE2E6] px-2.5 py-0.5 flex items-center justify-between text-[10.5px] font-mono tabular-nums text-[#1E293B] shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold">Fit:</span>
            <span>{fitResult.equation}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              R²: <strong>{fitResult.rSquared.toFixed(4)}</strong>
            </span>
            {fitResult.rmse !== undefined && (
              <span>
                RMSE: <strong>{fitResult.rmse.toFixed(4)}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* ======================== MAIN GRAPH CANVAS AREA (>=82% PANEL HEIGHT) ======================== */}
      <div className="flex-1 w-full p-1.5 min-h-0 bg-white overflow-hidden flex flex-col">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#64748B] text-xs">
            <Activity className="w-8 h-8 text-[#94A3B8] mb-2 stroke-1" />
            <p className="font-semibold text-[#1E293B]">No tracking points recorded yet</p>
            <p className="text-[11px] text-[#64748B] mt-1">
              Shift+Click on the video frame to digitize observations for 6-channel motion graphing
            </p>
          </div>
        ) : viewMode === 'dual-sync' ? (
          /* ======================== MODE B: SYNCHRONIZED DUAL PANELS (SIGNED TOP / DISTANCE BOTTOM) ======================== */
          <div
            id="dual-sync-panels-container"
            ref={dualContainerRef}
            className="flex-1 h-full flex flex-col min-h-0"
          >
            {/* PANEL 1: Raw Signed Position / Displacement */}
            {dualGraphSplitPct > 5 && (
              <div
                id="dual-panel-1-signed"
                style={{
                  height:
                    dualGraphSplitPct >= 95
                      ? '100%'
                      : `${dualGraphSplitPct}%`,
                }}
                className="flex flex-col border border-[#CBD5E1] rounded-[3px] bg-white p-1 min-h-0 overflow-hidden"
              >
                <div className="h-[22px] flex items-center justify-between border-b border-[#E2E8F0] px-1.5 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-[10.5px] text-[#0F172A] truncate">
                      Panel 1 — Signed{' '}
                      {isRotationalChannel(varY) ? 'Angular' : 'Displacement'}: {ySignedLabel}
                    </span>
                    <div className="flex items-center gap-0.5 bg-[#F1F5F9] border border-[#CBD5E1] rounded-[2px] p-0.5 text-[9px] font-semibold shrink-0">
                      <button
                        type="button"
                        onClick={() => updateConfig({ dualGraphSplitPct: 100 })}
                        className={`px-1.5 rounded-[2px] ${
                          dualGraphSplitPct >= 95
                            ? 'bg-[#2563EB] text-white'
                            : 'text-[#475569] hover:bg-white'
                        }`}
                        title="Expand Top Signed Panel Only"
                      >
                        Top
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfig({ dualGraphSplitPct: 50 })}
                        className={`px-1.5 rounded-[2px] ${
                          dualGraphSplitPct > 5 && dualGraphSplitPct < 95
                            ? 'bg-[#2563EB] text-white'
                            : 'text-[#475569] hover:bg-white'
                        }`}
                        title="Balanced 50/50 Dual Panel Split"
                      >
                        50/50
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfig({ dualGraphSplitPct: 0 })}
                        className={`px-1.5 rounded-[2px] ${
                          dualGraphSplitPct <= 5
                            ? 'bg-[#2563EB] text-white'
                            : 'text-[#475569] hover:bg-white'
                        }`}
                        title="Expand Bottom Distance Panel Only"
                      >
                        Bottom
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono tabular-nums text-[10px] text-[#475569] shrink-0">
                    <span className="hidden sm:inline">Signed (±)</span>
                    {inspectedPoint && inspectedPoint.ySigned !== null && (
                      <span className="font-bold text-[#0F172A] bg-[#F8FAFC] border border-[#CBD5E1] px-1.5 rounded-[2px]">
                        {inspectedPoint.ySigned >= 0 ? '+' : ''}
                        {inspectedPoint.ySigned.toFixed(4)} {yUnit}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      syncId="tracker-dual-sync"
                      margin={{ top: 6, right: 16, left: 0, bottom: 2 }}
                      onMouseMove={(e: any) => {
                        if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                          setHoveredFrame(e.activePayload[0].payload.frame);
                        }
                      }}
                      onMouseLeave={() => setHoveredFrame(null)}
                      onClick={(e: any) => {
                        if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                          onSelectFrame(e.activePayload[0].payload.frame);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        type="number"
                        dataKey="xVal"
                        domain={zoomDomainX || (varX !== 't' ? ['auto', 'auto'] : ['dataMin', 'dataMax'])}
                        allowDataOverflow={Boolean(zoomDomainX)}
                        allowDuplicatedCategory={false}
                        stroke="#334155"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(2)}
                      />
                      <YAxis
                        type="number"
                        dataKey="ySigned"
                        domain={zoomDomainY || ['auto', 'auto']}
                        allowDataOverflow={Boolean(zoomDomainY)}
                        stroke="#334155"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(2)}
                        label={{
                          value: ySignedLabel,
                          angle: -90,
                          position: 'insideLeft',
                          offset: 10,
                          fill: '#0f172a',
                          fontSize: 10,
                        }}
                      />
                      <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" strokeWidth={1} />
                      {varX === 't' && useRelativeTime && (
                        <ReferenceLine x={0} stroke="#dc2626" strokeDasharray="3 3" strokeWidth={1} />
                      )}
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload as DerivedGraphPoint;
                            return (
                              <div className="bg-white border border-[#CBD5E1] rounded-[3px] p-1.5 text-[10px] font-mono tabular-nums text-[#0F172A] shadow-md">
                                <div className="font-bold text-[#334155]">
                                  Frame #{d.frame} (Δt: {d.relTime?.toFixed(3)}s)
                                </div>
                                <div className="text-[#2563EB] font-bold">
                                  Signed {varY.toUpperCase()}: {d.ySigned ?? 'GAP'} {yUnit}
                                </div>
                                <div className="text-[#64748B]">
                                  Status: {d.observationStatus}
                                  {d.isReferenceT0 ? ' • Reference Origin t₀' : ''}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {showLegend && <Legend verticalAlign="top" height={18} wrapperStyle={{ fontSize: '10px' }} />}
                      {showUncertaintyBand && (
                        <>
                          <Line
                            type="linear"
                            dataKey="ySignedUpper"
                            name="+1σ Bound"
                            stroke="#94a3b8"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                          <Line
                            type="linear"
                            dataKey="ySignedLower"
                            name="-1σ Bound"
                            stroke="#94a3b8"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        </>
                      )}
                      <Line
                        type="linear"
                        dataKey="ySigned"
                        name={`Signed ${ySignedLabel}`}
                        stroke={CHANNEL_COLORS[varY] || '#2563EB'}
                        strokeWidth={2}
                        connectNulls={false}
                        dot={renderCustomDot(CHANNEL_COLORS[varY] || '#2563EB')}
                        activeDot={{ r: 5, stroke: '#0f172a', strokeWidth: 1.5 }}
                        isAnimationActive={false}
                      />
                      {referenceT0Point &&
                        referenceT0Point.xVal !== null &&
                        referenceT0Point.ySigned !== null && (
                          <ReferenceDot
                            x={referenceT0Point.xVal}
                            y={referenceT0Point.ySigned}
                            r={6}
                            fill="#ffffff"
                            stroke="#dc2626"
                            strokeWidth={2}
                          />
                        )}
                      {activePoint && activePoint.xVal !== null && activePoint.ySigned !== null && (
                        <ReferenceDot
                          x={activePoint.xVal}
                          y={activePoint.ySigned}
                          r={5}
                          fill="#dc2626"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Interactive Horizontal Resizer Divider between Top Signed & Bottom Distance Panels */}
            {dualGraphSplitPct > 5 && dualGraphSplitPct < 95 && (
              <div
                id="dual-panel-horizontal-resizer"
                onMouseDown={handleStartDualSplitDrag}
                onDoubleClick={() => updateConfig({ dualGraphSplitPct: 50 })}
                className="h-1.5 my-0.5 cursor-row-resize bg-[#E2E8F0] hover:bg-[#2563EB] transition-colors flex items-center justify-center rounded-[1px] shrink-0 group"
                title="Drag to resize Top Signed vs Bottom Distance panel ratio (Double-click to reset to 50% / 50%)"
              >
                <GripHorizontal className="w-3.5 h-3 text-[#64748B] group-hover:text-white" />
              </div>
            )}

            {/* PANEL 2: Non-Negative Calculated Distance from Reference Position t0 */}
            {dualGraphSplitPct < 95 && (
              <div
                id="dual-panel-2-distance"
                style={{
                  height:
                    dualGraphSplitPct <= 5
                      ? '100%'
                      : `${100 - dualGraphSplitPct}%`,
                }}
                className="flex flex-col border border-[#CBD5E1] rounded-[3px] bg-white p-1 min-h-0 overflow-hidden"
              >
                <div className="h-[22px] flex items-center justify-between border-b border-[#E2E8F0] px-1.5 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-[10.5px] text-[#0F172A] truncate">
                      Panel 2 — Distance from t₀: {yDistanceLabel}
                    </span>
                    {dualGraphSplitPct <= 5 && (
                      <div className="flex items-center gap-0.5 bg-[#F1F5F9] border border-[#CBD5E1] rounded-[2px] p-0.5 text-[9px] font-semibold shrink-0">
                        <button
                          type="button"
                          onClick={() => updateConfig({ dualGraphSplitPct: 100 })}
                          className="px-1.5 rounded-[2px] text-[#475569] hover:bg-white"
                        >
                          Top
                        </button>
                        <button
                          type="button"
                          onClick={() => updateConfig({ dualGraphSplitPct: 50 })}
                          className="px-1.5 rounded-[2px] text-[#475569] hover:bg-white"
                        >
                          50/50
                        </button>
                        <button
                          type="button"
                          onClick={() => updateConfig({ dualGraphSplitPct: 0 })}
                          className="px-1.5 rounded-[2px] bg-[#2563EB] text-white"
                        >
                          Bottom
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-0.5 bg-[#F1F5F9] border border-[#CBD5E1] rounded-[2px] p-0.5 text-[9.5px] shrink-0">
                      <button
                        id="btn-panel2-abs"
                        type="button"
                        onClick={() => updateConfig({ panel2TransformMode: 'abs' })}
                        className={`px-1.5 rounded-[2px] font-semibold transition-colors ${
                          effectivePanel2Mode === 'abs'
                            ? 'bg-[#2563EB] text-white'
                            : 'text-[#475569] hover:bg-white'
                        }`}
                        title="Positive Signed / Rectified Curve |Δq(t)|"
                      >
                        |Δ{varY.toUpperCase()}(t)|
                      </button>
                      {isVectorOrPathTransformAllowed(varY, 'magnitude') && (
                        <button
                          id="btn-panel2-d3d"
                          type="button"
                          onClick={() => updateConfig({ panel2TransformMode: 'magnitude' })}
                          className={`px-1.5 rounded-[2px] font-semibold transition-colors ${
                            effectivePanel2Mode === 'magnitude'
                              ? 'bg-[#2563EB] text-white'
                              : 'text-[#475569] hover:bg-white'
                          }`}
                          title="3D Euclidean Radial Displacement Magnitude D3D(t)"
                        >
                          D₃D(t)
                        </button>
                      )}
                      {isVectorOrPathTransformAllowed(varY, 'path_length') && (
                        <button
                          id="btn-panel2-path"
                          type="button"
                          onClick={() => updateConfig({ panel2TransformMode: 'path_length' })}
                          className={`px-1.5 rounded-[2px] font-semibold transition-colors ${
                            effectivePanel2Mode === 'path_length'
                              ? 'bg-[#2563EB] text-white'
                              : 'text-[#475569] hover:bg-white'
                          }`}
                          title="Cumulative 3D Travelled Path Length L(t)"
                        >
                          Path L(t)
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono tabular-nums text-[10px] text-[#475569] shrink-0">
                    <span className="hidden sm:inline">Non-negative (≥ 0)</span>
                    {inspectedPoint && inspectedPoint.yPanel2Distance !== null && (
                      <span className="font-bold text-[#0F172A] bg-[#F8FAFC] border border-[#CBD5E1] px-1.5 rounded-[2px]">
                        {inspectedPoint.yPanel2Distance.toFixed(4)} {yUnit}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    syncId="tracker-dual-sync"
                    margin={{ top: 8, right: 20, left: 0, bottom: 16 }}
                    onMouseMove={(e: any) => {
                      if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                        setHoveredFrame(e.activePayload[0].payload.frame);
                      }
                    }}
                    onMouseLeave={() => setHoveredFrame(null)}
                    onClick={(e: any) => {
                      if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                        onSelectFrame(e.activePayload[0].payload.frame);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        type="number"
                        dataKey="xVal"
                        domain={zoomDomainX || (varX !== 't' ? ['auto', 'auto'] : ['dataMin', 'dataMax'])}
                        allowDataOverflow={Boolean(zoomDomainX)}
                        allowDuplicatedCategory={false}
                        stroke="#0f172a"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(2)}
                        label={{
                          value: xLabel,
                          position: 'insideBottom',
                          offset: -10,
                          fill: '#0f172a',
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="yPanel2Distance"
                        domain={[0, 'auto']}
                        stroke="#0f172a"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(2)}
                        label={{
                          value: yDistanceLabel,
                          angle: -90,
                          position: 'insideLeft',
                          offset: 10,
                          fill: '#0f172a',
                          fontSize: 10,
                        }}
                      />
                      <ReferenceLine y={0} stroke="#047857" strokeWidth={1} />
                      {varX === 't' && useRelativeTime && (
                        <ReferenceLine x={0} stroke="#dc2626" strokeDasharray="3 3" strokeWidth={1} />
                      )}
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload as DerivedGraphPoint;
                            return (
                              <div className="bg-white border border-[#808080] rounded-[2px] p-1.5 text-[10px] font-mono tabular-nums text-black shadow-xs">
                                <div className="font-bold text-slate-700">
                                  Frame #{d.frame} (Δt: {d.relTime?.toFixed(3)}s)
                                </div>
                                <div className="text-[#047857] font-bold">
                                  {yDistanceLabel}: {d.yPanel2Distance ?? 'GAP'} {yUnit}
                                </div>
                                {!isRotationalChannel(varY) && (
                                  <div className="text-slate-600">
                                    |Δ{varY.toUpperCase()}|: {d.yAbs ?? '—'}m · D₃D: {d.d3d ?? '—'}m · L(t): {d.pathLength ?? '—'}m
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {showLegend && <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: '10px' }} />}
                      {showUncertaintyBand && (
                        <>
                          <Line
                            type="linear"
                            dataKey="yDistUpper"
                            name="+1σ Bound"
                            stroke="#94a3b8"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                          <Line
                            type="linear"
                            dataKey="yDistLower"
                            name="-1σ Bound"
                            stroke="#94a3b8"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        </>
                      )}
                      <Line
                        type="linear"
                        dataKey="yPanel2Distance"
                        name={`Distance ${yDistanceLabel}`}
                        stroke="#047857"
                        strokeWidth={2}
                        connectNulls={false}
                        dot={renderCustomDot('#047857')}
                        activeDot={{ r: 5, stroke: '#0f172a', strokeWidth: 1.5 }}
                        isAnimationActive={false}
                      />
                      {referenceT0Point &&
                        referenceT0Point.xVal !== null &&
                        referenceT0Point.yPanel2Distance !== null && (
                          <ReferenceDot
                            x={referenceT0Point.xVal}
                            y={referenceT0Point.yPanel2Distance}
                            r={6}
                            fill="#ffffff"
                            stroke="#dc2626"
                            strokeWidth={2}
                          />
                        )}
                      {activePoint &&
                        activePoint.xVal !== null &&
                        activePoint.yPanel2Distance !== null && (
                          <ReferenceDot
                            x={activePoint.xVal}
                            y={activePoint.yPanel2Distance}
                            r={5.5}
                            fill="#dc2626"
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'overlay' ? (
          /* ======================== MODE A: OVERLAY SIGNED & NON-NEGATIVE DISTANCE ======================== */
          <div id="overlay-panel-container" className="h-full flex flex-col border border-[#808080] rounded-[2px] bg-[#fcfcfd] p-2">
            <div className="flex flex-wrap items-center justify-between pb-1.5 mb-1 border-b border-[#e2e8f0] px-1 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[11px] text-slate-900">
                  Mode A — Overlay: Signed {ySignedLabel} &amp; Non-Negative Distance {yDistanceLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <label className="flex items-center gap-1 cursor-pointer font-semibold text-[#047857]">
                  <input
                    type="checkbox"
                    checked={showOverlayDistance}
                    onChange={(e) => updateConfig({ showOverlayDistance: e.target.checked })}
                  />
                  <span>Show Distance Curve ({yDistanceLabel})</span>
                </label>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 18 }}
                  onMouseMove={(e: any) => {
                    if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                      setHoveredFrame(e.activePayload[0].payload.frame);
                    }
                  }}
                  onMouseLeave={() => setHoveredFrame(null)}
                  onClick={(e: any) => {
                    if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                      onSelectFrame(e.activePayload[0].payload.frame);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis
                    type="number"
                    dataKey="xVal"
                    domain={zoomDomainX || (varX !== 't' ? ['auto', 'auto'] : ['dataMin', 'dataMax'])}
                    allowDataOverflow={Boolean(zoomDomainX)}
                    allowDuplicatedCategory={false}
                    stroke="#0f172a"
                    fontSize={10}
                    tickFormatter={(v) => Number(v).toFixed(2)}
                    label={{
                      value: xLabel,
                      position: 'insideBottom',
                      offset: -10,
                      fill: '#0f172a',
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="number"
                    domain={zoomDomainY || ['auto', 'auto']}
                    allowDataOverflow={Boolean(zoomDomainY)}
                    stroke="#0f172a"
                    fontSize={10}
                    tickFormatter={(v) => Number(v).toFixed(2)}
                    label={{
                      value: `${varY.toUpperCase()} (${yUnit})`,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 12,
                      fill: '#0f172a',
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" strokeWidth={1} />
                  {varX === 't' && useRelativeTime && (
                    <ReferenceLine x={0} stroke="#dc2626" strokeDasharray="3 3" strokeWidth={1} />
                  )}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload as DerivedGraphPoint;
                        return (
                          <div className="bg-white border border-[#808080] rounded-[2px] p-2 text-[11px] font-mono tabular-nums text-black shadow-xs">
                            <div className="font-bold text-slate-800 mb-1">
                              Frame #{d.frame} (Δt: {d.relTime?.toFixed(3)}s)
                            </div>
                            <div className="text-[#1e3a5f] font-bold">
                              Signed: {d.ySigned ?? 'GAP'} {yUnit}
                            </div>
                            {showOverlayDistance && (
                              <div className="text-[#047857] font-bold">
                                Distance: {d.yPanel2Distance ?? 'GAP'} {yUnit}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    type="linear"
                    dataKey="ySigned"
                    name={`Signed ${ySignedLabel}`}
                    stroke={CHANNEL_COLORS[varY] || '#1e3a5f'}
                    strokeWidth={2}
                    connectNulls={false}
                    dot={renderCustomDot(CHANNEL_COLORS[varY] || '#1e3a5f')}
                    isAnimationActive={false}
                  />
                  {showOverlayDistance && (
                    <Line
                      type="linear"
                      dataKey="yPanel2Distance"
                      name={`Non-Negative Distance ${yDistanceLabel}`}
                      stroke="#047857"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      connectNulls={false}
                      dot={renderCustomDot('#047857')}
                      isAnimationActive={false}
                    />
                  )}
                  {fitType !== 'none' && (
                    <Line
                      type="monotone"
                      dataKey="fitY"
                      name="Fitted Curve"
                      stroke="#b45309"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {referenceT0Point &&
                    referenceT0Point.xVal !== null &&
                    referenceT0Point.ySigned !== null && (
                      <ReferenceDot
                        x={referenceT0Point.xVal}
                        y={referenceT0Point.ySigned}
                        r={6}
                        fill="#ffffff"
                        stroke="#dc2626"
                        strokeWidth={2}
                      />
                    )}
                  {activePoint && activePoint.xVal !== null && activePoint.ySigned !== null && (
                    <ReferenceDot
                      x={activePoint.xVal}
                      y={activePoint.ySigned}
                      r={5.5}
                      fill="#dc2626"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : viewMode === 'multi-stack' ? (
          /* ======================== SYNCHRONIZED MULTI-CHANNEL STACK BY UNIT FAMILY ======================== */
          <div id="multi-stack-container" className="h-full flex flex-col gap-2 min-h-0">
            {/* Sub-Plot 1: Translational Channels (meters) */}
            {selectedTranslationalChannels.length > 0 && (
              <div
                id="multi-stack-translational"
                className="flex-1 flex flex-col border border-[#808080] rounded-[2px] bg-[#fcfcfd] p-1.5 min-h-[120px]"
              >
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#e2e8f0] px-1.5 shrink-0">
                  <span className="font-bold text-[11px] text-[#1e3a5f] flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5" />
                    <span>
                      Translational Channels ({selectedTranslationalChannels.map((c) => c.toUpperCase()).join(', ')}) — Unit: meters (m)
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-600">
                    Mode: {transformMode.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      syncId="tracker-multi-stack"
                      margin={{ top: 6, right: 20, left: 0, bottom: 8 }}
                      onClick={(e: any) => {
                        if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                          onSelectFrame(e.activePayload[0].payload.frame);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        type="number"
                        dataKey="plotTime"
                        domain={zoomDomainX || ['dataMin', 'dataMax']}
                        allowDataOverflow={Boolean(zoomDomainX)}
                        stroke="#0f172a"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(2)}
                      />
                      <YAxis
                        type="number"
                        domain={transformMode !== 'signed' ? [0, 'auto'] : ['auto', 'auto']}
                        stroke="#0f172a"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(2)}
                        label={{
                          value: 'Displacement (m)',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 10,
                          fill: '#0f172a',
                          fontSize: 10,
                        }}
                      />
                      <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" />
                      <Tooltip />
                      <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: '10px' }} />
                      {selectedTranslationalChannels.includes('x') && (
                        <Line
                          type="linear"
                          dataKey="xActive"
                          name="X (m)"
                          stroke={CHANNEL_COLORS.x}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 2.5 }}
                          isAnimationActive={false}
                        />
                      )}
                      {selectedTranslationalChannels.includes('y') && (
                        <Line
                          type="linear"
                          dataKey="yActiveCh"
                          name="Y (m)"
                          stroke={CHANNEL_COLORS.y}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 2.5 }}
                          isAnimationActive={false}
                        />
                      )}
                      {selectedTranslationalChannels.includes('z') && (
                        <Line
                          type="linear"
                          dataKey="zActive"
                          name="Z (m)"
                          stroke={CHANNEL_COLORS.z}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 2.5 }}
                          isAnimationActive={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Sub-Plot 2: Rotational Channels (deg or rad) */}
            {selectedRotationalChannels.length > 0 && (
              <div
                id="multi-stack-rotational"
                className="flex-1 flex flex-col border border-[#808080] rounded-[2px] bg-[#fcfcfd] p-1.5 min-h-[120px]"
              >
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#e2e8f0] px-1.5 shrink-0">
                  <span className="font-bold text-[11px] text-[#b45309] flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    <span>
                      Rotational Channels ({selectedRotationalChannels.map((c) => c.toUpperCase()).join(', ')}) — Unit: {angleUnit === 'rad' ? 'radians (rad)' : 'degrees (°)'}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-600">
                    Wrap: {angleWrapMode === 'unwrapped' ? 'Continuous Unwrapped' : 'Shortest [-180°,+180°]'}
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      syncId="tracker-multi-stack"
                      margin={{ top: 6, right: 20, left: 0, bottom: 14 }}
                      onClick={(e: any) => {
                        if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                          onSelectFrame(e.activePayload[0].payload.frame);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        type="number"
                        dataKey="plotTime"
                        domain={zoomDomainX || ['dataMin', 'dataMax']}
                        allowDataOverflow={Boolean(zoomDomainX)}
                        stroke="#0f172a"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(2)}
                        label={{
                          value: useRelativeTime ? 'Relative Time Δt (s)' : 'Time t (s)',
                          position: 'insideBottom',
                          offset: -8,
                          fill: '#0f172a',
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        type="number"
                        domain={transformMode === 'abs' ? [0, 'auto'] : ['auto', 'auto']}
                        stroke="#0f172a"
                        fontSize={10}
                        tickFormatter={(v) => Number(v).toFixed(1)}
                        label={{
                          value: `Angle (${angleUnit === 'rad' ? 'rad' : '°'})`,
                          angle: -90,
                          position: 'insideLeft',
                          offset: 10,
                          fill: '#0f172a',
                          fontSize: 10,
                        }}
                      />
                      <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" />
                      <Tooltip />
                      <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: '10px' }} />
                      {selectedRotationalChannels.includes('roll') && (
                        <Line
                          type="linear"
                          dataKey="rollActive"
                          name={`Roll φ (${angleUnit === 'rad' ? 'rad' : '°'})`}
                          stroke={CHANNEL_COLORS.roll}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 2.5 }}
                          isAnimationActive={false}
                        />
                      )}
                      {selectedRotationalChannels.includes('pitch') && (
                        <Line
                          type="linear"
                          dataKey="pitchActive"
                          name={`Pitch θ (${angleUnit === 'rad' ? 'rad' : '°'})`}
                          stroke={CHANNEL_COLORS.pitch}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 2.5 }}
                          isAnimationActive={false}
                        />
                      )}
                      {selectedRotationalChannels.includes('yaw') && (
                        <Line
                          type="linear"
                          dataKey="yawActive"
                          name={`Yaw ψ (${angleUnit === 'rad' ? 'rad' : '°'})`}
                          stroke={CHANNEL_COLORS.yaw}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 2.5 }}
                          isAnimationActive={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'telemetry-6dof' ? (
          /* ======================== 6-DOF TELEMETRY MULTI-CHART GRID (ALL 6 CHANNELS) ======================== */
          <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 overflow-y-auto p-1">
            {[
              { key: 'xActive', ch: 'x' as SixDofChannel, title: 'X Displacement', unit: 'm', color: CHANNEL_COLORS.x },
              { key: 'yActiveCh', ch: 'y' as SixDofChannel, title: 'Y Displacement', unit: 'm', color: CHANNEL_COLORS.y },
              { key: 'zActive', ch: 'z' as SixDofChannel, title: 'Z Displacement', unit: 'm', color: CHANNEL_COLORS.z },
              { key: 'rollActive', ch: 'roll' as SixDofChannel, title: 'Roll (φ — About X)', unit: angleUnit === 'rad' ? 'rad' : '°', color: CHANNEL_COLORS.roll },
              { key: 'pitchActive', ch: 'pitch' as SixDofChannel, title: 'Pitch (θ — About Y)', unit: angleUnit === 'rad' ? 'rad' : '°', color: CHANNEL_COLORS.pitch },
              { key: 'yawActive', ch: 'yaw' as SixDofChannel, title: 'Yaw (ψ — About Z)', unit: angleUnit === 'rad' ? 'rad' : '°', color: CHANNEL_COLORS.yaw },
            ].map((plot) => {
              const curVal = chartData.find((d) => d.frame === currentFrame);
              const activeVal = curVal ? (curVal as any)[plot.key] : null;
              const isNonNeg =
                transformMode !== 'signed' &&
                !(isRotationalChannel(plot.ch) && transformMode !== 'abs');

              return (
                <div
                  key={plot.key}
                  className="flex flex-col border border-[#808080] rounded-[2px] bg-[#f8f9fa] p-1.5 min-h-[165px]"
                >
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#d0d0d0] px-1">
                    <button
                      type="button"
                      onClick={() => updateConfig({ varY: plot.ch, viewMode: 'dual-sync' })}
                      className="font-bold text-[11px] text-black hover:underline flex items-center gap-1"
                      title={`Inspect ${plot.title} in Synchronized Dual-Panel mode`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: plot.color }}
                      />
                      {plot.title}
                    </button>
                    {activeVal !== null && activeVal !== undefined && (
                      <span className="font-mono tabular-nums text-[10px] font-bold bg-white border border-[#808080] px-1 rounded-[2px] text-black">
                        {Number(activeVal).toFixed(3)} {plot.unit}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 w-full min-h-[115px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        syncId="tracker-6dof-grid"
                        margin={{ top: 5, right: 12, left: -12, bottom: 5 }}
                        onClick={(e: any) => {
                          if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                            onSelectFrame(e.activePayload[0].payload.frame);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="2 2" stroke="#e0e0e0" />
                        <XAxis
                          type="number"
                          dataKey="plotTime"
                          stroke="#555"
                          fontSize={9}
                          tickFormatter={(v) => Number(v).toFixed(2)}
                        />
                        <YAxis
                          type="number"
                          dataKey={plot.key}
                          stroke="#555"
                          fontSize={9}
                          tickFormatter={(v) => Number(v).toFixed(1)}
                          domain={isNonNeg ? [0, 'auto'] : ['auto', 'auto']}
                        />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
                        <Tooltip />
                        <Line
                          type="linear"
                          dataKey={plot.key}
                          stroke={plot.color}
                          strokeWidth={1.8}
                          connectNulls={false}
                          dot={{ r: 2, fill: plot.color }}
                          isAnimationActive={false}
                        />
                        {curVal && curVal.plotTime !== null && (curVal as any)[plot.key] !== null && (
                          <ReferenceDot
                            x={curVal.plotTime}
                            y={(curVal as any)[plot.key]}
                            r={4.5}
                            fill="#dc2626"
                            stroke="#ffffff"
                            strokeWidth={1.2}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ======================== SINGLE HIGH-RESOLUTION CONFIGURABLE PLOT ======================== */
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 12, right: 20, left: 0, bottom: 20 }}
              onMouseMove={(e: any) => {
                if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                  setHoveredFrame(e.activePayload[0].payload.frame);
                }
              }}
              onMouseLeave={() => setHoveredFrame(null)}
              onClick={(e: any) => {
                if (e?.activePayload?.[0]?.payload?.frame !== undefined) {
                  onSelectFrame(e.activePayload[0].payload.frame);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#cccccc" />
              <XAxis
                type="number"
                dataKey="xVal"
                domain={zoomDomainX || (varX !== 't' ? ['auto', 'auto'] : ['dataMin', 'dataMax'])}
                allowDataOverflow={Boolean(zoomDomainX)}
                allowDuplicatedCategory={false}
                stroke="#000000"
                fontSize={10}
                tickFormatter={(val) => Number(val).toFixed(2)}
                label={{
                  value: xLabel,
                  position: 'insideBottom',
                  offset: -12,
                  fill: '#000000',
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="yActive"
                stroke="#000000"
                fontSize={10}
                tickFormatter={(val) => Number(val).toFixed(2)}
                domain={
                  zoomDomainY ||
                  (transformMode !== 'signed' &&
                  !(isRotationalChannel(varY) && transformMode !== 'abs')
                    ? [0, 'auto']
                    : ['auto', 'auto'])
                }
                allowDataOverflow={Boolean(zoomDomainY)}
                label={{
                  value: yActiveLabel,
                  angle: -90,
                  position: 'insideLeft',
                  offset: 12,
                  fill: '#000000',
                  fontSize: 11,
                }}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as DerivedGraphPoint;
                    return (
                      <div className="bg-white border border-[#808080] rounded-[2px] p-2 text-xs font-mono tabular-nums text-black shadow-xs">
                        <div className="text-[#333333] mb-1 font-semibold">
                          Frame #{data.frame} (Δt: {data.relTime?.toFixed(3)}s)
                        </div>
                        <div className="text-black font-bold">
                          {xLabel}: <strong>{data.xVal}</strong>
                        </div>
                        <div className="text-[#1e3a5f] font-bold">
                          {yActiveLabel}: <strong>{data.yActive}</strong>
                        </div>
                        {data.fitY !== null && data.fitY !== undefined && (
                          <div className="text-[#b45309] text-[10px] font-medium">
                            Fit: {data.fitY}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {showLegend && <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: '11px' }} />}
              {fitType !== 'none' && (
                <Line
                  type="monotone"
                  dataKey="fitY"
                  stroke="#b45309"
                  strokeWidth={2}
                  dot={false}
                  name="Fitted Curve"
                  isAnimationActive={false}
                />
              )}
              <Line
                type="linear"
                dataKey="yActive"
                stroke={CHANNEL_COLORS[varY] || activeTrack?.color || '#1e3a5f'}
                strokeWidth={2}
                connectNulls={false}
                dot={renderCustomDot(CHANNEL_COLORS[varY] || activeTrack?.color || '#1e3a5f')}
                activeDot={{ r: 5.5, stroke: '#1e3a5f', strokeWidth: 2 }}
                name={yActiveLabel}
                isAnimationActive={false}
              />
              {referenceT0Point &&
                referenceT0Point.xVal !== null &&
                referenceT0Point.yActive !== null && (
                  <ReferenceDot
                    x={referenceT0Point.xVal}
                    y={referenceT0Point.yActive}
                    r={6.5}
                    fill="#ffffff"
                    stroke="#dc2626"
                    strokeWidth={2}
                  />
                )}
              {activePoint && activePoint.xVal !== null && activePoint.yActive !== null && (
                <ReferenceDot
                  x={activePoint.xVal}
                  y={activePoint.yActive}
                  r={6}
                  fill="#b91c1c"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
