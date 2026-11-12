import { describe, it, expect } from 'vitest';
import {
  PlotVariable,
  GraphTransformMode,
  PointStep,
  GraphConfig,
} from '../src/types';
import {
  SIX_DOF_CHANNELS,
  DEFAULT_GRAPH_CONFIG,
  DEFAULT_MISSILE_NED_SIGN_MATRIX,
  STANDARD_CARTESIAN_ENU_SIGN_MATRIX,
  RESEARCH_PLOT_PRESETS,
  swapGraphAxes,
  shortestAngleDiffDeg,
  evaluateSixChannelStepValue,
  deriveSixChannelSeries,
  isVectorOrPathTransformAllowed,
  getChannelUnit,
  formatSignMatrixSummary,
} from '../src/utils/sixChannelGraphing';
import { buildCertifiedDefenseTelemetryCSV } from '../src/components/TableView';
import {
  serializeProject,
  validateAndParseProject,
} from '../src/utils/projectPersistence';

/**
 * Backward-compatible pure evaluation helper for single-step assertions
 */
export function evaluatePlotValue(
  step: PointStep,
  variable: PlotVariable,
  transformMode: GraphTransformMode,
  allSteps: PointStep[] = [step]
): number | null {
  return evaluateSixChannelStepValue(step, allSteps, variable, transformMode, {
    referenceFrameT0: null,
    relativeToOrigin: false,
    useRelativeTime: false,
  });
}

describe('Advanced Six-Channel Motion-Analysis Graphing & Position-to-Distance Engine', () => {
  // Sample 6-DOF reconstructed trajectory dataset with negative excursions and attitude changes
  const sampleTrajectory: PointStep[] = [
    {
      frame: 10,
      time: 1.0,
      px: 100,
      py: 200,
      x: 2.0,
      y: 5.0,
      z: -1.0,
      rollDeg: 10.0,
      elevationDeg: -5.0, // Pitch
      azimuthDeg: 175.0,  // Yaw near +180 boundary
      vx: -3.0,
      vy: 4.0,
      vz: 12.0,
      ax: -1.0,
      ay: -9.8,
      az: 0.5,
    },
    {
      frame: 11,
      time: 1.1,
      px: 90,
      py: 190,
      x: -1.0, // ΔX = -3.0 m from frame 10
      y: 9.0,  // ΔY = +4.0 m from frame 10
      z: 11.0, // ΔZ = +12.0 m from frame 10 (3-4-12 right triangle => D3D = 13.0 m)
      rollDeg: 15.0,
      elevationDeg: -12.0,
      azimuthDeg: 179.0, // +4° from frame 10
      vx: -3.0,
      vy: 4.0,
      vz: 12.0,
      ax: -1.0,
      ay: -9.8,
      az: 0.5,
    },
    {
      frame: 12,
      time: 1.2,
      px: 100,
      py: 200,
      x: 2.0,  // Returns back to initial X=2.0, Y=5.0, Z=-1.0!
      y: 5.0,
      z: -1.0,
      rollDeg: 5.0,
      elevationDeg: 2.0,
      azimuthDeg: -179.0, // Crossed +180°/-180° boundary by +2° from frame 11 (+6° total from frame 10)
      vx: 3.0,
      vy: -4.0,
      vz: -12.0,
      ax: 1.0,
      ay: -9.8,
      az: -0.5,
    },
  ];

  it('Criterion 1: supports all six motion channels (X, Y, Z, Roll, Pitch, Yaw)', () => {
    expect(SIX_DOF_CHANNELS).toEqual(['x', 'y', 'z', 'roll', 'pitch', 'yaw']);

    for (const channel of SIX_DOF_CHANNELS) {
      const val = evaluateSixChannelStepValue(
        sampleTrajectory[1],
        sampleTrajectory,
        channel,
        'signed',
        { referenceFrameT0: 10, relativeToOrigin: true }
      );
      expect(val).not.toBeNull();
      expect(Number.isFinite(val!)).toBe(true);
    }

    // Check expected relative values at frame 11 (t0 = frame 10)
    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'x', 'signed', {
        referenceFrameT0: 10,
        relativeToOrigin: true,
      })
    ).toBeCloseTo(-3.0, 5);
    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'y', 'signed', {
        referenceFrameT0: 10,
        relativeToOrigin: true,
      })
    ).toBeCloseTo(4.0, 5);
    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'z', 'signed', {
        referenceFrameT0: 10,
        relativeToOrigin: true,
      })
    ).toBeCloseTo(12.0, 5);
    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'roll', 'signed', {
        referenceFrameT0: 10,
        relativeToOrigin: true,
      })
    ).toBeCloseTo(5.0, 5);
    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'pitch', 'signed', {
        referenceFrameT0: 10,
        relativeToOrigin: true,
      })
    ).toBeCloseTo(-7.0, 5);
    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'yaw', 'signed', {
        referenceFrameT0: 10,
        relativeToOrigin: true,
      })
    ).toBeCloseTo(4.0, 5);
  });

  it('Criterion 2 & 3: allows any valid channel on horizontal/vertical axes and supports Swap Axes', () => {
    const combinations: Array<{ varX: any; varY: PlotVariable }> = [
      { varX: 't', varY: 'x' },
      { varX: 't', varY: 'roll' },
      { varX: 'x', varY: 'y' },
      { varX: 'x', varY: 'z' },
      { varX: 'y', varY: 'z' },
      { varX: 'roll', varY: 'pitch' },
      { varX: 'pitch', varY: 'yaw' },
    ];

    for (const combo of combinations) {
      const config: GraphConfig = {
        ...DEFAULT_GRAPH_CONFIG,
        varX: combo.varX,
        varY: combo.varY,
        referenceFrameT0: 10,
      };
      const { points } = deriveSixChannelSeries(sampleTrajectory, config);
      expect(points.length).toBe(3);
      expect(points[1].xVal).not.toBeNull();
      expect(points[1].yActive).not.toBeNull();

      // Verify Swap Axes exchanges horizontal and vertical values accurately
      const swappedAxes = swapGraphAxes(combo.varX, combo.varY);
      expect(swappedAxes.varX).toBe(combo.varY);
      expect(swappedAxes.varY).toBe(combo.varX);

      const swappedConfig: GraphConfig = {
        ...config,
        varX: swappedAxes.varX,
        varY: swappedAxes.varY,
      };
      const { points: swappedPoints } = deriveSixChannelSeries(sampleTrajectory, swappedConfig);
      expect(swappedPoints[1].xVal).toBeCloseTo(points[1].yActive!, 4);
      expect(swappedPoints[1].yActive).toBeCloseTo(points[1].xVal!, 4);
    }
  });

  it('Criterion 4 & 5: Signed displacement preserves negative values while Absolute-value curves are non-negative', () => {
    const config: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      varX: 't',
      varY: 'x',
      referenceFrameT0: 10,
      relativeToOrigin: true,
    };

    const { points } = deriveSixChannelSeries(sampleTrajectory, config);
    // At frame 11, X moved from +2.0 to -1.0 => ΔX = -3.0 m
    expect(points[1].ySigned).toBeCloseTo(-3.0, 5);
    expect(points[1].ySigned!).toBeLessThan(0);

    // Absolute distance |ΔX| must be +3.0 m (>= 0)
    expect(points[1].yAbs).toBeCloseTo(3.0, 5);
    for (const pt of points) {
      if (pt.yAbs !== null) {
        expect(pt.yAbs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('Criterion 6: 3D Vector Magnitude uses all three translational components and is guarded from rotational channels', () => {
    // At frame 11 relative to frame 10: ΔX = -3, ΔY = 4, ΔZ = 12 => D3D = sqrt(9 + 16 + 144) = sqrt(169) = 13.0 m
    const d3d = evaluateSixChannelStepValue(
      sampleTrajectory[1],
      sampleTrajectory,
      'x',
      'magnitude',
      { referenceFrameT0: 10, relativeToOrigin: true }
    );
    expect(d3d).toBeCloseTo(13.0, 5);

    // Guard check: 3D translational magnitude & cumulative path length must NOT apply to Roll, Pitch, or Yaw
    expect(isVectorOrPathTransformAllowed('roll', 'magnitude')).toBe(false);
    expect(isVectorOrPathTransformAllowed('pitch', 'magnitude')).toBe(false);
    expect(isVectorOrPathTransformAllowed('yaw', 'magnitude')).toBe(false);
    expect(isVectorOrPathTransformAllowed('roll', 'path_length')).toBe(false);

    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'roll', 'magnitude')
    ).toBeNull();
    expect(
      evaluateSixChannelStepValue(sampleTrajectory[1], sampleTrajectory, 'pitch', 'path_length')
    ).toBeNull();
  });

  it('Criterion 7: Cumulative 3D path length L(t) differs correctly from 3D radial displacement magnitude D3D(t)', () => {
    // Frame 10 -> Frame 11 moves 13.0 m away from origin.
    // Frame 11 -> Frame 12 returns 13.0 m back to the exact starting position (2.0, 5.0, -1.0).
    const config: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      varX: 't',
      varY: 'x',
      referenceFrameT0: 10,
      relativeToOrigin: true,
    };

    const { points } = deriveSixChannelSeries(sampleTrajectory, config);

    // At frame 10 (t0): both D3D and L(t) are 0
    expect(points[0].d3d).toBeCloseTo(0, 5);
    expect(points[0].pathLength).toBeCloseTo(0, 5);

    // At frame 11: both D3D and L(t) are 13.0 m
    expect(points[1].d3d).toBeCloseTo(13.0, 5);
    expect(points[1].pathLength).toBeCloseTo(13.0, 5);

    // At frame 12 (returned to start): radial displacement D3D is 0.0 m, whereas cumulative path length L(t) is 26.0 m!
    expect(points[2].d3d).toBeCloseTo(0.0, 5);
    expect(points[2].pathLength).toBeCloseTo(26.0, 5);
  });

  it('Criterion 8 & 9: all reference-relative curves equal zero at t0, and changing t0 updates graphs without mutating tracked observations', () => {
    const originalSnapshot = JSON.stringify(sampleTrajectory);

    // Test with t0 = frame 11
    const configAt11: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      varX: 't',
      varY: 'x',
      referenceFrameT0: 11,
      relativeToOrigin: true,
      useRelativeTime: true,
    };

    const { points } = deriveSixChannelSeries(sampleTrajectory, configAt11);
    const refPt = points.find((p) => p.frame === 11)!;

    expect(refPt.isReferenceT0).toBe(true);
    expect(refPt.relTime).toBeCloseTo(0, 6);
    expect(refPt.dx).toBeCloseTo(0, 6);
    expect(refPt.dy).toBeCloseTo(0, 6);
    expect(refPt.dz).toBeCloseTo(0, 6);
    expect(refPt.absX).toBeCloseTo(0, 6);
    expect(refPt.absY).toBeCloseTo(0, 6);
    expect(refPt.absZ).toBeCloseTo(0, 6);
    expect(refPt.d3d).toBeCloseTo(0, 6);
    expect(refPt.pathLength).toBeCloseTo(0, 6);
    expect(refPt.rollSigned).toBeCloseTo(0, 6);
    expect(refPt.pitchSigned).toBeCloseTo(0, 6);
    expect(refPt.yawSigned).toBeCloseTo(0, 6);

    // At frame 10 (before t0=11): Δt = -0.1s, ΔX = 2.0 - (-1.0) = +3.0 m
    const pt10 = points.find((p) => p.frame === 10)!;
    expect(pt10.relTime).toBeCloseTo(-0.1, 5);
    expect(pt10.dx).toBeCloseTo(3.0, 5);

    // Verify original tracked observations were NOT modified
    expect(JSON.stringify(sampleTrajectory)).toBe(originalSnapshot);
  });

  it('Criterion 10: Roll, Pitch, and Yaw properly handle angular wrapping across +179° to -179° in both degrees and radians', () => {
    // Direct shortest angle difference across +179° -> -179° must be +2°, not -358°
    expect(shortestAngleDiffDeg(-179, 179)).toBeCloseTo(2.0, 5);
    expect(shortestAngleDiffDeg(179, -179)).toBeCloseTo(-2.0, 5);

    // In sampleTrajectory, Yaw progresses: 175° (frame 10) -> 179° (frame 11) -> -179° (frame 12)
    // Continuous unwrapped relative to frame 10: 0° -> +4° -> +6°
    const yawUnwrappedF12 = evaluateSixChannelStepValue(
      sampleTrajectory[2],
      sampleTrajectory,
      'yaw',
      'signed',
      {
        referenceFrameT0: 10,
        relativeToOrigin: true,
        angleWrapMode: 'unwrapped',
        angleUnit: 'deg',
      }
    );
    expect(yawUnwrappedF12).toBeCloseTo(6.0, 5);

    // Same in radians: 6° * π / 180
    const yawRadiansF12 = evaluateSixChannelStepValue(
      sampleTrajectory[2],
      sampleTrajectory,
      'yaw',
      'signed',
      {
        referenceFrameT0: 10,
        relativeToOrigin: true,
        angleWrapMode: 'unwrapped',
        angleUnit: 'rad',
      }
    );
    expect(yawRadiansF12).toBeCloseTo((6.0 * Math.PI) / 180, 5);
    expect(getChannelUnit('yaw', 'rad')).toBe('rad');
    expect(getChannelUnit('yaw', 'deg')).toBe('°');
  });

  it('Criterion 11: Synchronized Dual Panels share identical time axes and pair Signed Panel 1 with Non-Negative Distance Panel 2', () => {
    const config: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      viewMode: 'dual-sync',
      varX: 't',
      varY: 'x',
      panel2TransformMode: 'abs',
      referenceFrameT0: 10,
    };

    const { points } = deriveSixChannelSeries(sampleTrajectory, config);
    expect(points.map((p) => p.xVal)).toEqual([0, 0.1, 0.2]);
    // Panel 1 signed: [0, -3.0, 0]
    expect(points.map((p) => p.ySigned)).toEqual([0, -3, 0]);
    // Panel 2 non-negative distance: [0, +3.0, 0]
    expect(points.map((p) => p.yPanel2Distance)).toEqual([0, 3, 0]);
  });

  it('Criterion 12: Graph configuration survives project serialization and validation/reopening', () => {
    const customGraphConfig: GraphConfig = {
      varY: 'pitch',
      varX: 'roll',
      selectedChannels: ['x', 'z', 'pitch', 'yaw'],
      transformMode: 'abs',
      panel2TransformMode: 'magnitude',
      viewMode: 'multi-stack',
      referenceFrameT0: 11,
      relativeToOrigin: true,
      useRelativeTime: true,
      angleWrapMode: 'shortest',
      angleUnit: 'rad',
      showOverlayDistance: false,
      showLegend: true,
      fitType: 'parabolic',
      zoomDomainX: [-0.5, 2.5],
      zoomDomainY: [0, 15],
    };

    const savedProject = serializeProject({
      analysisMode: '3D',
      experimentTitle: 'Store Separation Six-Channel Test',
      axes: { origin: { x: 320, y: 240 }, angle: 0, visible: true, locked: false, gridVisible: false },
      tracks: [
        {
          id: 'track-1',
          name: 'Store A',
          color: '#1e3a5f',
          mass: 1.0,
          footprint: 'circle',
          steps: sampleTrajectory,
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
        },
      ],
      graphConfig: customGraphConfig,
    });

    const jsonString = JSON.stringify(savedProject);
    const parsed = validateAndParseProject(jsonString);

    expect(parsed.valid).toBe(true);
    expect(parsed.data?.graphConfig).toEqual(customGraphConfig);
  });

  it('Criterion 13: Missing or rejected observations produce null gaps rather than artificial zero values', () => {
    const trajectoryWithMissingAndRejected: PointStep[] = [
      sampleTrajectory[0], // Frame 10
      // Frame 11 is missing (frame gap 10 -> 12)
      sampleTrajectory[2], // Frame 12
      {
        ...sampleTrajectory[1],
        frame: 13,
        time: 1.3,
        rejected: true, // Explicitly rejected observation
      },
    ];

    const { points } = deriveSixChannelSeries(
      trajectoryWithMissingAndRejected,
      DEFAULT_GRAPH_CONFIG,
      true
    );

    // Should contain a gap entry for missing frame 11 and a rejected entry for frame 13
    const missingGap = points.find((p) => p.observationStatus === 'missing');
    expect(missingGap).toBeDefined();
    expect(missingGap!.ySigned).toBeNull();
    expect(missingGap!.yAbs).toBeNull();
    expect(missingGap!.yPanel2Distance).toBeNull();

    const rejectedPt = points.find((p) => p.frame === 13);
    expect(rejectedPt).toBeDefined();
    expect(rejectedPt!.observationStatus).toBe('rejected');
    expect(rejectedPt!.ySigned).toBeNull();
    expect(rejectedPt!.yAbs).toBeNull();
    expect(rejectedPt!.d3d).toBeNull();
  });

  it('Criterion 14: Explicit 6-DOF Missile Body Sign & Direction Matrix and derivative inheritance (filter & differentiate before rectifying)', () => {
    // Verify official Missile/Store 6-DOF User Requirement Specification defaults
    expect(DEFAULT_MISSILE_NED_SIGN_MATRIX.x.directionLabel).toContain('Towards Nose');
    expect(DEFAULT_MISSILE_NED_SIGN_MATRIX.y.directionLabel).toContain('Towards Right');
    expect(DEFAULT_MISSILE_NED_SIGN_MATRIX.z.directionLabel).toContain('Downwards');
    expect(DEFAULT_MISSILE_NED_SIGN_MATRIX.roll.directionLabel).toContain('Towards Right');
    expect(DEFAULT_MISSILE_NED_SIGN_MATRIX.pitch.directionLabel).toContain('Nose Up');
    expect(DEFAULT_MISSILE_NED_SIGN_MATRIX.yaw.directionLabel).toContain('Towards Right');

    expect(formatSignMatrixSummary('NED_Z_DOWN', DEFAULT_MISSILE_NED_SIGN_MATRIX)).toContain(
      'Missile NED [X+:Towards Nose (Forward), Y+:Towards Right (Starboard), Z+:Downwards (Nadir)'
    );
    expect(formatSignMatrixSummary('NED_Z_DOWN', DEFAULT_MISSILE_NED_SIGN_MATRIX, undefined, true)).toContain(
      'Missile NED (X+:Nose, Y+:Right, Z+:Down | R+:Right, P+:Nose Up, Y+:Right)'
    );

    // Test per-channel inversion and Always Positive (|q|) on X and its derivatives vx, ax
    const invertedXMatrix = {
      ...DEFAULT_MISSILE_NED_SIGN_MATRIX,
      x: { ...DEFAULT_MISSILE_NED_SIGN_MATRIX.x, mode: 'inverted' as const, multiplier: -1 as const },
    };

    // Frame 11: ΔX = -3.0 m in standard => +3.0 m when X is inverted; vx = -3.0 m/s => +3.0 m/s
    const dxInverted = evaluateSixChannelStepValue(
      sampleTrajectory[1],
      sampleTrajectory,
      'x',
      'signed',
      { referenceFrameT0: 10, relativeToOrigin: true, channelSignConfig: invertedXMatrix }
    );
    const vxInverted = evaluateSixChannelStepValue(
      sampleTrajectory[1],
      sampleTrajectory,
      'vx',
      'signed',
      { referenceFrameT0: 10, relativeToOrigin: true, channelSignConfig: invertedXMatrix }
    );
    expect(dxInverted).toBeCloseTo(3.0, 5);
    expect(vxInverted).toBeCloseTo(3.0, 5);

    // Always Positive (|q|) mode rectifies both displacement and its derivatives at the final step
    const absPositivePitchMatrix = {
      ...DEFAULT_MISSILE_NED_SIGN_MATRIX,
      pitch: { ...DEFAULT_MISSILE_NED_SIGN_MATRIX.pitch, mode: 'abs_positive' as const, multiplier: 1 as const },
    };
    const pitchRectified = evaluateSixChannelStepValue(
      sampleTrajectory[1],
      sampleTrajectory,
      'pitch',
      'signed',
      { referenceFrameT0: 10, relativeToOrigin: true, channelSignConfig: absPositivePitchMatrix }
    );
    // Standard ΔPitch at frame 11 is -7.0°; with abs_positive it is +7.0° even when transformMode is 'signed'
    expect(pitchRectified).toBeCloseTo(7.0, 5);
  });

  it('Criterion 15: Positive Signing |Δq(t)| (abs) is unlocked for Roll, Pitch, Yaw, and derivative channels in Single and Dual Sync modes', () => {
    expect(isVectorOrPathTransformAllowed('roll', 'abs')).toBe(true);
    expect(isVectorOrPathTransformAllowed('pitch', 'abs')).toBe(true);
    expect(isVectorOrPathTransformAllowed('yaw', 'abs')).toBe(true);
    expect(isVectorOrPathTransformAllowed('vx', 'abs')).toBe(true);
    // 3D Vector Magnitude and Cumulative Path Length remain restricted for rotational channels
    expect(isVectorOrPathTransformAllowed('pitch', 'magnitude')).toBe(false);
    expect(isVectorOrPathTransformAllowed('pitch', 'path_length')).toBe(false);

    const dualPitchConfig: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      viewMode: 'dual-sync',
      varX: 't',
      varY: 'pitch',
      transformMode: 'signed',
      panel2TransformMode: 'abs',
      referenceFrameT0: 10,
      relativeToOrigin: true,
    };

    const { points } = deriveSixChannelSeries(sampleTrajectory, dualPitchConfig);
    // Frame 11 ΔPitch = -7.0° (signed on Panel 1) and +7.0° (|ΔPitch| on Panel 2)
    expect(points[1].ySigned).toBeCloseTo(-7.0, 5);
    expect(points[1].yPanel2Distance).toBeCloseTo(7.0, 5);
  });

  it('Criterion 16: Universal cross-channel parametric plotting (Roll vs Pitch, Pitch vs Velocity, Z vs X) with independent X/Y sign and |q| controls', () => {
    expect(RESEARCH_PLOT_PRESETS.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        'x-vs-time',
        'z-drop-vs-time',
        'pitch-vs-time',
        'yaw-vs-time',
        'roll-vs-pitch',
        'pitch-vs-velocity',
        'z-vs-x',
      ])
    );

    // Parametric plot: Roll (Y) vs Pitch (X) with X-axis positive rectification (|Pitch|) and Y-axis inversion (-Roll)
    const parametricConfig: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      varY: 'roll',
      varX: 'pitch',
      transformMode: 'signed',
      invertChannels: { roll: true },
      transformModeX: 'abs',
      invertVarX: false,
      referenceFrameT0: 10,
      relativeToOrigin: true,
    };

    const { points } = deriveSixChannelSeries(sampleTrajectory, parametricConfig);
    // Chronological order preserved: frames 10, 11, 12
    expect(points.map((p) => p.frame)).toEqual([10, 11, 12]);
    // At frame 11: ΔPitch = -7.0° => xVal (|ΔPitch|) = +7.0°; ΔRoll = +5.0° => yActive (-ΔRoll) = -5.0°
    expect(points[1].xVal).toBeCloseTo(7.0, 5);
    expect(points[1].yActive).toBeCloseTo(-5.0, 5);
  });

  it('Criterion 17: Data Table & Certified CSV parity applies 6-DOF Sign & Direction Matrix and records convention metadata', () => {
    const customSignConfig = {
      ...STANDARD_CARTESIAN_ENU_SIGN_MATRIX,
      x: { ...STANDARD_CARTESIAN_ENU_SIGN_MATRIX.x, mode: 'abs_positive' as const, multiplier: 1 as const },
    };

    const csv = buildCertifiedDefenseTelemetryCSV(
      {
        id: 'trk-1',
        name: 'Store Separation Track',
        color: '#38BDF8',
        mass: 1.0,
        footprint: 'circle',
        steps: sampleTrajectory,
        visible: true,
        showVectors: true,
        showTrails: true,
        showLabels: true,
      },
      undefined,
      '6DOF',
      {
        ...DEFAULT_GRAPH_CONFIG,
        coordConvention: 'NED_Z_DOWN',
        channelSignConfig: customSignConfig,
      }
    );

    expect(csv).toContain('# CERTIFIED DEFENSE TELEMETRY');
    expect(csv).toContain('# 6-DOF Sign & Direction Matrix:');
    expect(csv).toContain('X|+|:');

    // At frame 11, raw ΔX is -3.0 m and vx is -3.0 m/s; because X is set to abs_positive (|X|), both dX_m and vx_mps are rectified to +3.0
    const lines = csv.trim().split('\n');
    const dataLines = lines.filter((l) => !l.startsWith('#'));
    const headers = dataLines[0].split(',');
    const dxColIdx = headers.indexOf('dX_m');
    const vxColIdx = headers.indexOf('vx_mps');
    expect(dxColIdx).toBeGreaterThanOrEqual(0);
    expect(vxColIdx).toBeGreaterThanOrEqual(0);
    // dataLines[0] is header, dataLines[2] is frame 11
    const frame11Cols = dataLines[2].split(',');
    expect(frame11Cols[0]).toBe('11');
    expect(parseFloat(frame11Cols[dxColIdx])).toBeCloseTo(3.0, 4);
    expect(parseFloat(frame11Cols[vxColIdx])).toBeCloseTo(3.0, 4);
  });
});

