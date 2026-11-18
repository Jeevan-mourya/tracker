import { describe, it, expect } from 'vitest';
import {
  computeZeroSafeErrorPct,
  computeFilterNoiseAttenuationFactor,
  classifyMetrologyGrade,
  compute2DKinematicsErrorMetrics,
  compute3DStereoTriangulationErrorMetrics,
  compute6DofPoseErrorMetrics,
  computeSeriesErrorAnalysis,
  buildMetrologyAuditBudget,
} from '../src/utils/metrologyErrorEngine';
import {
  deriveSixChannelSeries,
  DEFAULT_GRAPH_CONFIG,
} from '../src/utils/sixChannelGraphing';
import { buildCertifiedDefenseTelemetryCSV } from '../src/components/TableView';
import { renderPublicationPlotSVG } from '../src/components/PlotView';
import { PointStep, Track } from '../src/types';

describe('Range-Safety Metrological Error Percentage & Accuracy Certification Engine', () => {
  it('1. Zero-Crossing Stability: produces finite, bounded Error % when Z = 0.000 m and Pitch = 0.000 deg', () => {
    // Exact zero crossing with zero span and zero value
    const errZero = computeZeroSafeErrorPct(0.0015, 0.0, 0.0, 1.0);
    expect(Number.isFinite(errZero)).toBe(true);
    expect(Number.isNaN(errZero)).toBe(false);
    expect(errZero).toBeGreaterThan(0);
    expect(errZero).toBeLessThan(5);

    // Trajectory crossing Z = 0.000 m and Pitch = 0.000 deg at Frame 2
    const steps: PointStep[] = [
      { frame: 0, time: 0.0, px: 100, py: 200, x: 0.5, y: 0.2, z: -0.4, pitch: -4.0, sigmaZ: 0.0012, sigmaPitch: 0.08 },
      { frame: 1, time: 0.01, px: 110, py: 205, x: 0.6, y: 0.1, z: -0.2, pitch: -2.0, sigmaZ: 0.0012, sigmaPitch: 0.08 },
      { frame: 2, time: 0.02, px: 120, py: 210, x: 0.7, y: 0.0, z: 0.0, pitch: 0.0, sigmaZ: 0.0012, sigmaPitch: 0.08 },
      { frame: 3, time: 0.03, px: 130, py: 215, x: 0.8, y: -0.1, z: 0.2, pitch: 2.0, sigmaZ: 0.0012, sigmaPitch: 0.08 },
      { frame: 4, time: 0.04, px: 140, py: 220, x: 0.9, y: -0.2, z: 0.4, pitch: 4.0, sigmaZ: 0.0012, sigmaPitch: 0.08 },
    ];

    const zDerived = deriveSixChannelSeries(
      steps,
      { ...DEFAULT_GRAPH_CONFIG, varY: 'z', varX: 't', relativeToOrigin: false },
      true,
      { analysisMode: '6dof', fps: 100 }
    );

    for (const pt of zDerived.points) {
      expect(Number.isFinite(pt.errorPct)).toBe(true);
      expect(Number.isFinite(pt.accuracyPct)).toBe(true);
      expect(pt.errorPct!).toBeGreaterThanOrEqual(0);
      expect(pt.errorPct!).toBeLessThan(100);
    }

    const pitchDerived = deriveSixChannelSeries(
      steps,
      { ...DEFAULT_GRAPH_CONFIG, varY: 'pitch', varX: 't', relativeToOrigin: false },
      true,
      { analysisMode: '6dof', fps: 100 }
    );

    for (const pt of pitchDerived.points) {
      expect(Number.isFinite(pt.errorPct)).toBe(true);
      expect(Number.isFinite(pt.accuracyPct)).toBe(true);
    }
  });

  it('2. Filter-Attenuated Derivative Error Propagation (eta_filt): prevents 1000+ fps explosion', () => {
    const dt = 0.001; // 1,000 fps
    const etaRaw = computeFilterNoiseAttenuationFactor(dt, {
      type: 'raw',
      windowSize: 7,
      polyOrder: 2,
      cutoffHz: 45,
    });
    const etaButter = computeFilterNoiseAttenuationFactor(dt, {
      type: 'butterworth',
      windowSize: 7,
      polyOrder: 2,
      cutoffHz: 45,
    });
    const etaSavgol = computeFilterNoiseAttenuationFactor(dt, {
      type: 'savgol',
      windowSize: 11,
      polyOrder: 2,
      cutoffHz: 45,
    });

    expect(etaRaw).toBe(1.0);
    // At 1000 fps with fc = 45 Hz, sqrt(2 * 45 * 0.001) = sqrt(0.09) = 0.30
    expect(etaButter).toBeCloseTo(0.3, 2);
    expect(etaButter).toBeLessThan(etaRaw);
    expect(etaSavgol).toBeLessThan(etaRaw);

    // High-speed 1000 fps velocity series error with vs without Butterworth attenuation
    const highSpeedSteps: PointStep[] = Array.from({ length: 20 }, (_, i) => ({
      frame: i,
      time: i * 0.001,
      px: 100 + i * 5,
      py: 200 + i * 3,
      x: i * 0.02,
      y: i * 0.01,
      z: i * 0.03,
      vx: 20,
      vy: 10,
      vz: 30,
      v: 37.4,
      sigmaZ: 0.0008,
    }));

    const vzFiltered = computeSeriesErrorAnalysis({
      steps: highSpeedSteps,
      frames: highSpeedSteps.map((s) => s.frame),
      yValues: highSpeedSteps.map((s) => s.vz ?? 30),
      xValues: highSpeedSteps.map((s) => s.time),
      varY: 'vz',
      varX: 't',
      transformModeY: 'signed',
      config: {
        ...DEFAULT_GRAPH_CONFIG,
        varY: 'vz',
        varX: 't',
        filterConfig: { type: 'butterworth', windowSize: 7, polyOrder: 2, cutoffHz: 35 },
      },
      context: { analysisMode: '6dof', fps: 1000 },
    });

    const vzRaw = computeSeriesErrorAnalysis({
      steps: highSpeedSteps,
      frames: highSpeedSteps.map((s) => s.frame),
      yValues: highSpeedSteps.map((s) => s.vz ?? 30),
      xValues: highSpeedSteps.map((s) => s.time),
      varY: 'vz',
      varX: 't',
      transformModeY: 'signed',
      config: {
        ...DEFAULT_GRAPH_CONFIG,
        varY: 'vz',
        varX: 't',
        filterConfig: { type: 'raw', windowSize: 7, polyOrder: 2, cutoffHz: 35 },
      },
      context: { analysisMode: '6dof', fps: 1000 },
    });

    expect(vzFiltered.filterAttenuationFactor).toBeLessThan(
      vzRaw.filterAttenuationFactor
    );
    expect(vzFiltered.absoluteRMSE).toBeLessThan(vzRaw.absoluteRMSE);
    expect(vzFiltered.rmsErrorPct).toBeLessThan(vzRaw.rmsErrorPct);
  });

  it('3. Synthetic Calibration across Modes A (2D), B (3D Stereo DLT), and C (6-DOF + Lever-Arm)', () => {
    // Mode A: 2D Kinematics
    const raw2D = [0.0, 0.251, 0.499, 0.752, 1.001, 1.249, 1.500];
    const smooth2D = [0.0, 0.250, 0.500, 0.750, 1.000, 1.250, 1.500];
    const modeA = compute2DKinematicsErrorMetrics({
      calibrationStickPx: 500,
      subPixelSigmaPx: 0.15,
      rawSeries: raw2D,
      smoothedSeries: smooth2D,
      characteristicLengthMeters: 1.5,
    });
    expect(modeA.combinedErrorPct).toBeGreaterThan(0);
    expect(modeA.combinedErrorPct).toBeLessThan(0.5);

    // Mode B: 3D Stereo DLT Triangulation
    const modeB = compute3DStereoTriangulationErrorMetrics({
      reprojErrCam1Px: 0.22,
      reprojErrCam2Px: 0.24,
      raySkewMeters: 0.0014,
      speedMps: 15.0,
      syncTimingJitterSec: 0.00005,
      max3DDisplacementMeters: 2.0,
      calibrationVolumeLengthMeters: 2.5,
    });
    expect(modeB.error3DPct).toBeGreaterThan(0);
    expect(modeB.error3DPct).toBeLessThan(0.5);

    // Mode C: Monocular 6-DOF PnP + Virtual Point Lever-Arm cross-product amplification
    const modeCCG = compute6DofPoseErrorMetrics({
      rmsePnpPx: 0.25,
      bboxDiagonalPx: 340,
      sigmaPosMeters: 0.0015,
      sigmaAttDeg: [0.08, 0.08, 0.08],
      leverArmMeters: [0, 0, 0], // CG
      spanPosMeters: 1.5,
      spanAttDeg: 12.0,
    });

    const modeCNose = compute6DofPoseErrorMetrics({
      rmsePnpPx: 0.25,
      bboxDiagonalPx: 340,
      sigmaPosMeters: 0.0015,
      sigmaAttDeg: [0.08, 0.08, 0.08],
      leverArmMeters: [1.85, 0, 0], // Nose Tip lever arm
      spanPosMeters: 1.5,
      spanAttDeg: 12.0,
    });

    expect(modeCNose.virtualPointSigmaMeters).toBeGreaterThan(
      modeCCG.virtualPointSigmaMeters
    );
    expect(classifyMetrologyGrade(0.36).grade).toBe('A');
    expect(classifyMetrologyGrade(1.25).grade).toBe('B');
    expect(classifyMetrologyGrade(2.45).grade).toBe('C');
  });

  it('4. Dual-Unit Parametric Error Synthesis (varX !== "t") & Folded-Normal Clamping on |q|', () => {
    const steps: PointStep[] = [
      { frame: 0, time: 0.0, px: 100, py: 200, x: 0.0, y: 0.0, z: -0.0005, v: 10, pitch: 0.5, roll: -1.0, sigmaZ: 0.002, sigmaPitch: 0.08, sigmaRoll: 0.1 },
      { frame: 1, time: 0.02, px: 120, py: 210, x: 0.2, y: 0.1, z: 0.0002, v: 15, pitch: 2.5, roll: 0.5, sigmaZ: 0.002, sigmaPitch: 0.08, sigmaRoll: 0.1 },
      { frame: 2, time: 0.04, px: 140, py: 220, x: 0.4, y: 0.2, z: 0.15, v: 20, pitch: 5.0, roll: 2.0, sigmaZ: 0.002, sigmaPitch: 0.08, sigmaRoll: 0.1 },
    ];

    // Parametric plot: Pitch vs Velocity (varX = 'v', varY = 'pitch')
    const paramDerived = deriveSixChannelSeries(
      steps,
      {
        ...DEFAULT_GRAPH_CONFIG,
        varY: 'pitch',
        varX: 'v',
        transformMode: 'abs',
        relativeToOrigin: false,
      },
      false,
      { analysisMode: '6dof', fps: 50 }
    );

    expect(paramDerived.panel1ErrorReport.isParametric).toBe(true);
    expect(paramDerived.panel1ErrorReport.xUnit).toBe('m/s');
    expect(paramDerived.panel1ErrorReport.unit).toBe('°');
    expect(paramDerived.panel1ErrorReport.xAbsoluteRMSE).toBeDefined();

    // Check Folded-Normal Clamping: lower bounds on positive-rectified curves must never be < 0
    const zAbsDerived = deriveSixChannelSeries(
      steps,
      {
        ...DEFAULT_GRAPH_CONFIG,
        varY: 'z',
        varX: 't',
        transformMode: 'abs',
        relativeToOrigin: false,
      },
      true,
      { analysisMode: '6dof', fps: 50 }
    );

    for (const pt of zAbsDerived.points) {
      if (pt.yDistLower !== null) {
        expect(pt.yDistLower).toBeGreaterThanOrEqual(0);
      }
      if (pt.yActiveLower !== null && pt.yActiveLower !== undefined) {
        expect(pt.yActiveLower).toBeGreaterThanOrEqual(0);
      }
    }

    const budget = buildMetrologyAuditBudget(zAbsDerived.panel1ErrorReport);
    expect(budget.length).toBeGreaterThanOrEqual(3);
  });

  it('5. Certified Defense Telemetry CSV & Publication SVG include Metrological Accuracy Summary', () => {
    const track: Track = {
      id: 'trk-cert-1',
      name: 'Store_Separation_Run1',
      color: '#2563EB',
      mass: 120,
      footprint: 'circle',
      visible: true,
      showVectors: true,
      showTrails: true,
      showLabels: true,
      steps: [
        { frame: 10, time: 0.0, px: 200, py: 300, x: 0.0, y: 0.0, z: 0.0, vx: 0, vy: 0, vz: 0, v: 0, sigmaZ: 0.0014 },
        { frame: 11, time: 0.01, px: 215, py: 320, x: 0.1, y: 0.02, z: 0.25, vx: 10, vy: 2, vz: 25, v: 27, sigmaZ: 0.0014 },
        { frame: 12, time: 0.02, px: 230, py: 345, x: 0.2, y: 0.04, z: 0.55, vx: 10, vy: 2, vz: 30, v: 31.6, sigmaZ: 0.0014 },
      ],
    };

    const csv = buildCertifiedDefenseTelemetryCSV(
      track,
      { startFrame: 10, endFrame: 12, stepSize: 1, fps: 100 },
      '6DOF',
      DEFAULT_GRAPH_CONFIG,
      'defense',
      's'
    );

    expect(csv).toContain('# METROLOGICAL ACCURACY SUMMARY');
    expect(csv).toContain('# Overall Analysis Accuracy:');
    expect(csv).toContain('# Span-Normalized RMS Error (NRMSE):');
    expect(csv).toContain('# 95% Confidence Bound (2-Sigma):');
    expect(csv).toContain('# Range Safety Metrology Grade: GRADE');
    expect(csv).toContain('Error_Pct,Accuracy_Pct,Residual_Abs');

    const svg = renderPublicationPlotSVG(track, DEFAULT_GRAPH_CONFIG);
    expect(svg).toContain('Accuracy:');
    expect(svg).toContain('NRMSE:');
    expect(svg).toContain('Grade ');
  });
});
