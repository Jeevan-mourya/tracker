import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CAMERA_INTRINSICS,
  identityMat3,
  projectPoint3DToPixel,
  undistortPixelToNormalized,
  eulerZYXToMatrix,
  extractAerospaceEulerZYX,
  solveIterativePnPLM,
  solveKabschRigidBody3D,
  parseLeicaSurveyCSV,
  createSampleStoreSeparationDataset,
  solveMonocular6DoFSequence,
  Vec3,
} from '../src/math/monocular6DoF';
import {
  DEFAULT_GRAPH_CONFIG,
  deriveSixChannelSeries,
  applySavitzkyGolayFilter,
  applyZeroPhaseButterworthFilter,
  getChannelPolaritySign,
} from '../src/math/sixChannelGraphing';
import {
  AviHighSpeedLoader,
  createSyntheticAviBlob,
} from '../src/video/aviHighSpeedLoader';

describe('Add-On 1: Monocular 6-DOF Store Separation Photogrammetry', () => {
  it('accurately undistorts Brown-Conrady distorted pixel coordinates back to normalized rays', () => {
    const intrinsics = {
      ...DEFAULT_CAMERA_INTRINSICS,
      distortion: {
        enabled: true,
        k1: -0.08,
        k2: 0.015,
        k3: 0,
        p1: 0.001,
        p2: -0.001,
      },
    };
    const pCam: Vec3 = [0.45, -0.32, 3.0];
    const px = projectPoint3DToPixel(pCam, identityMat3(), [0, 0, 0], intrinsics);
    const undist = undistortPixelToNormalized(px.u, px.v, intrinsics);

    expect(undist.xn).toBeCloseTo(pCam[0] / pCam[2], 5);
    expect(undist.yn).toBeCloseTo(pCam[1] / pCam[2], 5);
  });

  it('extracts exact Aerospace ZYX Euler angles (Roll, Pitch, Yaw) from rotation matrix', () => {
    const roll = 12.5;
    const pitch = -8.25;
    const yaw = 4.75;
    const R = eulerZYXToMatrix(roll, pitch, yaw);
    const extracted = extractAerospaceEulerZYX(R);

    expect(extracted.rollDeg).toBeCloseTo(roll, 4);
    expect(extracted.pitchDeg).toBeCloseTo(pitch, 4);
    expect(extracted.yawDeg).toBeCloseTo(yaw, 4);
  });

  it('solves 6-DOF pose via POSIT + Huber Levenberg-Marquardt PnP with sub-pixel reprojection RMSE', () => {
    const dataset = createSampleStoreSeparationDataset(5, 500);
    const missileMarkers = dataset.config.markers.filter((m) => m.group === 'M');
    const trueR = eulerZYXToMatrix(4.2, -6.5, 2.1);
    const trueT: Vec3 = [0.18, 0.25, 4.15];

    const points3D: Vec3[] = missileMarkers.map((m) => [m.x, m.y, m.z]);
    const points2D = points3D.map((pt) => {
      const uv = projectPoint3DToPixel(pt, trueR, trueT, dataset.config.intrinsics);
      return { u: uv.u, v: uv.v };
    });

    const solved = solveIterativePnPLM(points3D, points2D, dataset.config.intrinsics);
    expect(solved.valid).toBe(true);
    expect(solved.rmsePx).toBeLessThan(0.05);
    expect(solved.t[0]).toBeCloseTo(trueT[0], 2);
    expect(solved.t[1]).toBeCloseTo(trueT[1], 2);
    expect(solved.t[2]).toBeCloseTo(trueT[2], 2);
  });

  it('cancels camera shake via SE(3) relative transformation T_{A<-M} = T_{C<-A}^{-1} * T_{C<-M}', () => {
    const dataset = createSampleStoreSeparationDataset(15, 500);
    const result = solveMonocular6DoFSequence(dataset.markerTracks, dataset.config, 500);

    expect(result.frameResults.length).toBe(15);
    const f0 = result.frameResults[0];
    const f14 = result.frameResults[14];

    expect(f0.relMissileWrtLauncher).not.toBeNull();
    expect(f14.relMissileWrtLauncher).not.toBeNull();

    // Store separates in downward trajectory relative to Launcher
    const dist14 = Math.hypot(
      f14.relMissileWrtLauncher!.referencePointPosition[0] - f0.relMissileWrtLauncher!.referencePointPosition[0],
      f14.relMissileWrtLauncher!.referencePointPosition[1] - f0.relMissileWrtLauncher!.referencePointPosition[1],
      f14.relMissileWrtLauncher!.referencePointPosition[2] - f0.relMissileWrtLauncher!.referencePointPosition[2]
    );
    expect(dist14).toBeGreaterThan(0.05);

    // Step has populated relativeFrames for PlotView switching
    const step14 = result.synthesizedMissileTrack.steps[14];
    expect(step14.relativeFrames?.M_wrt_L).toBeDefined();
    expect(step14.relativeFrames?.M_wrt_A).toBeDefined();
    expect(step14.relativeFrames?.L_wrt_A).toBeDefined();
  });

  it('solves 3D-to-3D rigid body pose via Kabsch SVD', () => {
    const modelPts: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const R = eulerZYXToMatrix(10, -15, 25);
    const t: Vec3 = [2.5, -1.2, 4.0];
    const worldPts: Vec3[] = modelPts.map((p) => [
      R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2] + t[0],
      R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2] + t[1],
      R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2] + t[2],
    ]);

    const pose = solveKabschRigidBody3D(modelPts, worldPts);
    expect(pose.valid).toBe(true);
    expect(pose.t[0]).toBeCloseTo(t[0], 4);
    expect(pose.t[1]).toBeCloseTo(t[1], 4);
    expect(pose.t[2]).toBeCloseTo(t[2], 4);
    expect(pose.rmsePx).toBeLessThan(1e-4);
  });

  it('parses Leica ACS survey CSV with A, L, and M rigid-body groups', () => {
    const csv = `PointID,Group,X,Y,Z,u_init,v_init
A1,A,0.0,0.0,0.9,320,180
L7,L,1.2,-0.1,0.4,410,250
M15,M,1.1,-0.2,0.1,405,310`;
    const parsed = parseLeicaSurveyCSV(csv);
    expect(parsed.length).toBe(3);
    expect(parsed[0].group).toBe('A');
    expect(parsed[1].group).toBe('L');
    expect(parsed[2].group).toBe('M');
    expect(parsed[2].u_init).toBe(405);
  });
});

describe('Add-On 2: Defense-Grade Graph Plotting (NED Z-Down, Relative Frames, SavGol/Butterworth)', () => {
  it('flips Z, Pitch, and Yaw signs in Aerospace NED_Z_DOWN convention and supports per-channel polarity inversion', () => {
    const dataset = createSampleStoreSeparationDataset(20, 500);
    const solved = solveMonocular6DoFSequence(dataset.markerTracks, dataset.config, 500);
    const steps = solved.synthesizedMissileTrack.steps;

    const enuConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      varY: 'z' as const,
      coordConvention: 'ENU_Z_UP' as const,
      referenceFrameMode: 'M_wrt_L' as const,
    };
    const nedConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      varY: 'z' as const,
      coordConvention: 'NED_Z_DOWN' as const,
      referenceFrameMode: 'M_wrt_L' as const,
    };

    const enuSeries = deriveSixChannelSeries(steps, enuConfig);
    const nedSeries = deriveSixChannelSeries(steps, nedConfig);

    const lastEnu = enuSeries.points[enuSeries.points.length - 1];
    const lastNed = nedSeries.points[nedSeries.points.length - 1];

    expect(lastNed.dz).not.toBeNull();
    expect(lastEnu.dz).not.toBeNull();
    // Verify NED Z signed value is exact opposite sign of ENU Z signed value, while absZ magnitude is non-negative and equal
    expect(lastNed.dz!).toBeCloseTo(-lastEnu.dz!, 5);
    expect(lastNed.absZ!).toBeGreaterThan(0);
    expect(lastNed.absZ!).toBeCloseTo(lastEnu.absZ!, 5);

    // Per-channel Invert Polarity toggle flips sign again
    expect(getChannelPolaritySign('z', 'NED_Z_DOWN', {})).toBe(-1);
    expect(getChannelPolaritySign('z', 'NED_Z_DOWN', { z: true })).toBe(1);
  });

  it('smooths noisy telemetry with Savitzky-Golay and Zero-Phase 4th-Order Butterworth filters without phase lag', () => {
    const n = 60;
    const dt = 1 / 500;
    const cleanSignal = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 8 * i * dt));
    const noisySignal = cleanSignal.map((v, i) => v + (i % 2 === 0 ? 0.18 : -0.18));

    const savgol = applySavitzkyGolayFilter(noisySignal, 9, 3);
    const butter = applyZeroPhaseButterworthFilter(noisySignal, 500, 25);

    let noisyErr = 0;
    let savgolErr = 0;
    let butterErr = 0;
    for (let i = 10; i < n - 10; i++) {
      noisyErr += (noisySignal[i] - cleanSignal[i]) ** 2;
      savgolErr += (savgol[i] - cleanSignal[i]) ** 2;
      butterErr += (butter[i] - cleanSignal[i]) ** 2;
    }
    expect(savgolErr).toBeLessThan(noisyErr * 0.25);
    expect(butterErr).toBeLessThan(noisyErr * 0.25);
  });
});

describe('Add-On 3: High-Speed .AVI Zero-Copy Chunked Demuxer', () => {
  it('parses RIFF/AVI headers via File.slice() without full arrayBuffer load and decodes Y800 monochrome frames', async () => {
    const width = 48;
    const height = 36;
    const fps = 500;
    const frameCount = 8;
    const aviBlob = createSyntheticAviBlob({ width, height, fps, frameCount, fourCC: 'Y800' });
    const aviFile = new File([aviBlob], 'store_sep_500fps.avi', { type: 'video/x-msvideo' });

    const loader = new AviHighSpeedLoader(aviFile, 16);
    const meta = await loader.initialize();

    expect(meta.width).toBe(width);
    expect(meta.height).toBe(height);
    expect(meta.fps).toBe(fps);
    expect(meta.totalFrames).toBe(frameCount);
    expect(meta.compressionFourCC).toBe('Y800');

    const frame0 = await loader.getFrameImageData(0);
    const frame5 = await loader.getFrameImageData(5);
    expect(frame0).not.toBeNull();
    expect(frame5).not.toBeNull();
    expect(frame0!.width).toBe(width);
    expect(frame0!.height).toBe(height);

    // Verify synthetic moving bright target at (10 + f*3, 15 + f) is decoded accurately
    const targetX5 = Math.min(width - 2, 10 + 5 * 3);
    const targetY5 = Math.min(height - 2, 15 + 5);
    const pixelIdx = (targetY5 * width + targetX5) * 4;
    expect(frame5!.data[pixelIdx]).toBe(250);

    // Run ZNCC + 2D Sub-Pixel Auto-Tracker across all 8 AVI frames via zero-copy File.slice()
    const { autoTrackSequenceOnAviLoader } = await import('../src/math/autoTracker');
    const tracked = await autoTrackSequenceOnAviLoader(loader, 0, frameCount - 1, 1, 10, 15, {
      templateRadius: 3,
      searchRadius: 8,
      minCorrelationScore: 0.7,
      templateEvolutionRate: 0.05,
      useVelocityPrediction: true,
    });

    expect(tracked.length).toBe(frameCount);
    expect(tracked[5].u).toBeCloseTo(targetX5, 0);
    expect(tracked[5].v).toBeCloseTo(targetY5, 0);
    expect(tracked[5].znccScore).toBeGreaterThan(0.85);

    loader.dispose();
  });
});

describe('Final Defense Metrology & Range Safety Certification (Covariance, Virtual Points, Certified CSV)', () => {
  it('propagates 6x6 se(3) pose covariance through Ad(T) and outputs 1-sigma uncertainties + marker counts', () => {
    const dataset = createSampleStoreSeparationDataset(12, 500);
    const solved = solveMonocular6DoFSequence(dataset.markerTracks, dataset.config, 500);

    const f5 = solved.frameResults[5];
    expect(f5.poseCamFromMissile?.covariance6x6).toBeDefined();
    expect(f5.markerCountA).toBe(6);
    expect(f5.markerCountL).toBe(8);
    expect(f5.markerCountM).toBe(8);

    const unc = f5.relMissileWrtLauncher?.uncertainty1Sigma;
    expect(unc).toBeDefined();
    expect(unc!.sigmaX).toBeGreaterThan(0);
    expect(unc!.sigmaY).toBeGreaterThan(0);
    expect(unc!.sigmaZ).toBeGreaterThan(0);
    expect(unc!.sigmaRoll).toBeGreaterThan(0);
    expect(unc!.sigmaPitch).toBeGreaterThan(0);
    expect(unc!.sigmaYaw).toBeGreaterThan(0);

    // Verify deriveSixChannelSeries populates ±1σ bounds (ySignedUpper / ySignedLower)
    const series = deriveSixChannelSeries(solved.synthesizedMissileTrack.steps, {
      ...DEFAULT_GRAPH_CONFIG,
      varY: 'z',
      showUncertaintyBand: true,
    });
    const pt5 = series.points[5];
    expect(pt5.ySigma).not.toBeNull();
    expect(pt5.ySigma!).toBeGreaterThan(0);
    expect(pt5.ySignedUpper!).toBeGreaterThan(pt5.ySigned!);
    expect(pt5.ySignedLower!).toBeLessThan(pt5.ySigned!);
    expect(pt5.markerCountM).toBe(8);
  });

  it('evaluates Virtual Critical Points (Nose Tip, Aft Upper Fin Tip, Tail Boattail) and computes Minimum Store-to-Pylon Clearance Envelope', () => {
    const dataset = createSampleStoreSeparationDataset(15, 500);
    const solved = solveMonocular6DoFSequence(dataset.markerTracks, dataset.config, 500);

    expect(solved.clearanceEnvelope.length).toBeGreaterThanOrEqual(4);
    expect(solved.overallMinClearance).not.toBeNull();
    expect(solved.overallMinClearance!.minDistanceMeters).toBeGreaterThanOrEqual(0);

    // Switching activeVirtualPointId in GraphConfig changes the plotted trajectory to the Nose Tip
    const cgSeries = deriveSixChannelSeries(solved.synthesizedMissileTrack.steps, {
      ...DEFAULT_GRAPH_CONFIG,
      varY: 'x',
      relativeToOrigin: false,
      activeVirtualPointId: 'vp-cg',
    });
    const noseSeries = deriveSixChannelSeries(solved.synthesizedMissileTrack.steps, {
      ...DEFAULT_GRAPH_CONFIG,
      varY: 'x',
      relativeToOrigin: false,
      activeVirtualPointId: 'vp-nose',
    });

    // Nose tip is at X = +1.85 m forward of Missile CG in body coordinates
    expect(noseSeries.points[0].ySigned! - cgSeries.points[0].ySigned!).toBeCloseTo(1.85, 1);

    // Post-release clearance envelope must evaluate across post-release frames (F# > 0), not trivially pegged to captive t0
    expect(solved.overallMinClearance!.closestApproachFrame).toBeGreaterThan(0);
    expect(solved.overallMinClearance!.minDistanceMeters).toBeGreaterThan(0.005);
  });

  it('generates Certified Defense Telemetry CSV with metadata header, virtual point parity, and 1-sigma uncertainty columns', async () => {
    const { buildCertifiedDefenseTelemetryCSV, buildDefenseTelemetryCSV } = await import(
      '../src/components/TableView'
    );
    const dataset = createSampleStoreSeparationDataset(10, 500);
    const solved = solveMonocular6DoFSequence(dataset.markerTracks, dataset.config, 500);

    const csvFin = buildDefenseTelemetryCSV(
      solved.synthesizedMissileTrack,
      { startFrame: 0, endFrame: 9, stepSize: 1, fps: 500, totalFrames: 10 },
      '6DOF',
      {
        ...DEFAULT_GRAPH_CONFIG,
        coordConvention: 'NED_Z_DOWN',
        referenceFrameMode: 'M_wrt_L',
        activeVirtualPointId: 'vp-fin-upper',
        filterConfig: { type: 'savgol', windowSize: 7, polyOrder: 2, cutoffHz: 45 },
      },
      'defense',
      'ms'
    );

    expect(csvFin).toContain('# CERTIFIED DEFENSE TELEMETRY & RANGE SAFETY METROLOGY EXPORT');
    expect(csvFin).toContain('# Active Workspace Mode: 6DOF');
    expect(csvFin).toContain('# Relative Reference Frame: M_wrt_L');
    expect(csvFin).toContain('# Coordinate Axes Convention: NED_Z_DOWN');
    expect(csvFin).toContain('# Derivative Conditioning Filter: Savitzky-Golay');
    expect(csvFin).toContain('# Minimum Store-to-Pylon Clearance:');
    expect(csvFin).toContain('N_A,N_L,N_M,PnP_RMS_px,sigma_X_m,sigma_Y_m,sigma_Z_m,sigma_Roll_deg,sigma_Pitch_deg,sigma_Yaw_deg');

    // Verify switching Reference Frame (M_wrt_A vs M_wrt_L) and Virtual Point (vp-nose vs vp-cg) updates CSV rows 1:1
    const csvCgL = buildCertifiedDefenseTelemetryCSV(
      solved.synthesizedMissileTrack,
      { startFrame: 0, endFrame: 9, stepSize: 1, fps: 500, totalFrames: 10 },
      '6DOF',
      {
        ...DEFAULT_GRAPH_CONFIG,
        referenceFrameMode: 'M_wrt_L',
        activeVirtualPointId: 'vp-cg',
      }
    );
    const csvNoseA = buildCertifiedDefenseTelemetryCSV(
      solved.synthesizedMissileTrack,
      { startFrame: 0, endFrame: 9, stepSize: 1, fps: 500, totalFrames: 10 },
      '6DOF',
      {
        ...DEFAULT_GRAPH_CONFIG,
        referenceFrameMode: 'M_wrt_A',
        activeVirtualPointId: 'vp-nose',
      }
    );
    expect(csvNoseA).toContain('# Relative Reference Frame: M_wrt_A');
    expect(csvNoseA).toContain('# Active Virtual Critical Point: vp-nose');
    expect(csvNoseA).not.toEqual(csvCgL);
  });

  it('exports Publication-Grade Vector SVG figures in both Publication Light and Tactical Dark themes', async () => {
    const { renderPublicationPlotSVG } = await import('../src/components/PlotView');
    const dataset = createSampleStoreSeparationDataset(10, 500);
    const solved = solveMonocular6DoFSequence(dataset.markerTracks, dataset.config, 500);

    const svgLight = renderPublicationPlotSVG(
      solved.synthesizedMissileTrack,
      {
        ...DEFAULT_GRAPH_CONFIG,
        varY: 'z',
        viewMode: 'dual-sync',
        coordConvention: 'NED_Z_DOWN',
        referenceFrameMode: 'M_wrt_L',
        activeVirtualPointId: 'vp-nose',
        showUncertaintyBand: true,
      },
      undefined,
      'publication-light'
    );

    expect(svgLight).toContain('<svg');
    expect(svgLight).toContain('IEEE / Defense Publication Light');
    expect(svgLight).toContain('TELEMETRY CERTIFICATION CAPTION');
    expect(svgLight).toContain('Reference Frame: M_wrt_L');
    expect(svgLight).toContain('Axes Convention: NED_Z_DOWN');

    const svgDark = renderPublicationPlotSVG(
      solved.synthesizedMissileTrack,
      {
        ...DEFAULT_GRAPH_CONFIG,
        varY: 'z',
        viewMode: 'dual-sync',
      },
      undefined,
      'tactical-dark'
    );

    expect(svgDark).toContain('Tactical Workstation Dark');
    expect(svgDark).toContain('#0b1120');
  });
});


