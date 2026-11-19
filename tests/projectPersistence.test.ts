import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import {
  serializeProject,
  serializeProjectToTrk,
  serializeAndValidateTrk,
  resolveDualExportFilenames,
  inferMediaMimeTypeFromFilename,
  validateAndParseProject,
  ingestWorkstationFile,
  isProjectFileOrBundle,
  saveSessionToLocalStorage,
  loadSynchronousSessionSnapshot,
  createHydrationController,
  AUTOSAVE_STORAGE_KEY_V2,
} from '../src/utils/projectPersistence';
import { inspectVideoFile } from '../src/utils/videoFormats';
import {
  DEFAULT_GRAPH_CONFIG,
  deriveSixChannelSeries,
} from '../src/utils/sixChannelGraphing';
import { PointStep } from '../src/types';

// Provide a deterministic in-memory localStorage mock if running in pure Node environment
const memoryStore = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, val: string) => {
        memoryStore.set(key, String(val));
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
      clear: () => {
        memoryStore.clear();
      },
    },
    configurable: true,
  });
}

describe('Bulletproof Session Persistence & Universal .TRK / .ZIP Project Serialization', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('1. 2D Round-Trip Test: 20 frames with NaN/null boundary velocities, calibration stick, and custom axes survive .trk round-trip with 100% fidelity', async () => {
    const rawSteps: PointStep[] = Array.from({ length: 20 }, (_, i) => {
      const t = i * 0.01;
      const x = 0.5 + 12.0 * t;
      const y = 2.0 + 4.0 * t - 0.5 * 9.81 * t * t;
      const isBoundary = i === 0 || i === 19;
      return {
        frame: i,
        time: t,
        px: 150 + x * 240,
        py: 420 - y * 240,
        x,
        y,
        // Inject boundary NaN / null derivatives that JSON.stringify turns into null
        vx: isBoundary ? (NaN as unknown as number) : 12.0,
        vy: isBoundary ? (null as unknown as number) : 4.0 - 9.81 * t,
        ax: isBoundary ? (Infinity as unknown as number) : 0.0,
        ay: isBoundary ? (-Infinity as unknown as number) : -9.81,
        v: isBoundary ? (NaN as unknown as number) : Math.hypot(12.0, 4.0 - 9.81 * t),
        a: isBoundary ? (null as unknown as number) : 9.81,
      };
    });

    const trkJson = serializeProjectToTrk({
      analysisMode: '2D',
      experimentTitle: 'Ballistic_20Frame_Boundary_Test',
      currentExpId: 'custom-2d-20f',
      activeTrackId: 'track-ballistic-1',
      currentFrame: 14,
      calibration: {
        active: true,
        pointA: { x: 100, y: 400 },
        pointB: { x: 340, y: 400 },
        p1: { x: 100, y: 400 },
        p2: { x: 340, y: 400 },
        realLength: 1.0,
        length: 1.0,
        unit: 'm',
        scale: 240,
        pixelsPerMeter: 240,
        locked: false,
        visible: true,
      },
      axes: {
        origin: { x: 150, y: 420 },
        angle: 2.5,
        visible: true,
        locked: true,
        gridVisible: true,
      },
      tracks: [
        {
          id: 'track-ballistic-1',
          name: 'Sabot Projectile',
          color: '#2563EB',
          mass: 0.45,
          footprint: 'circle',
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
          steps: rawSteps,
        },
      ],
    });

    // Inject UTF-8 BOM to verify BOM stripping in universal file router
    const trkFile = new File(['\uFEFF' + trkJson], 'Ballistic_20Frame_Boundary_Test.trk', {
      type: 'application/json',
    });

    const ingested = await ingestWorkstationFile(trkFile);
    expect(ingested.route).toBe('json-trk');
    expect(ingested.valid).toBe(true);
    expect(ingested.data).toBeDefined();

    const restored = ingested.data!;
    expect(restored.analysisMode).toBe('2D');
    expect(restored.experimentTitle).toBe('Ballistic_20Frame_Boundary_Test');
    expect(restored.currentFrame).toBe(14);
    expect(restored.calibration?.scale).toBe(240);
    expect(restored.axes.origin).toEqual({ x: 150, y: 420 });
    expect(restored.axes.angle).toBe(2.5);
    expect(restored.tracks).toHaveLength(1);
    expect(restored.tracks[0].steps).toHaveLength(20);

    // Verify all 20 frames have finite coordinates and recomputed interior kinematics without NaN/null crashes
    for (let i = 0; i < 20; i++) {
      const step = restored.tracks[0].steps[i];
      expect(step.frame).toBe(i);
      expect(Number.isFinite(step.x)).toBe(true);
      expect(Number.isFinite(step.y)).toBe(true);
      expect(step.x).toBeCloseTo(rawSteps[i].x, 5);
      expect(step.y).toBeCloseTo(rawSteps[i].y, 5);
    }
    expect(Number.isFinite(restored.tracks[0].steps[10].vx)).toBe(true);
    expect(Number.isFinite(restored.tracks[0].steps[10].vy)).toBe(true);
  });

  it('2. 6-DOF & Metrology Round-Trip Test: Solved poses, M_wrt_L, virtual points, Sign Convention Matrix, and AnalysisErrorReport match pre-save values', async () => {
    const steps6Dof: PointStep[] = Array.from({ length: 15 }, (_, i) => {
      const t = i * 0.01;
      return {
        frame: i,
        time: t,
        px: 640 + i * 8,
        py: 360 + i * 12,
        x: 0.05 * i,
        y: -0.08 * i - 0.5 * 9.81 * t * t,
        z: 12.5 + 0.12 * i,
        roll: 0.5 * i,
        pitch: -1.8 * i,
        yaw: 0.25 * i,
        reprojectionRMSE: 0.22,
        errorPct: 0.31,
        accuracyPct: 99.69,
        residualAbs: 0.014,
      };
    });

    const customGraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      varY: 'pitch' as const,
      varX: 't' as const,
      signConventionMatrix: {
        ...DEFAULT_GRAPH_CONFIG.signConventionMatrix,
        pitch: { sign: -1 as const, offset: 1.5, alwaysPositive: false },
      },
    };

    const projectPreSave = serializeProject({
      analysisMode: '6DOF',
      experimentTitle: 'F18_AIM9X_Store_Separation_6DOF',
      currentExpId: 'f18-store-sep-6dof',
      activeTrackId: 'store-track-6dof',
      currentFrame: 8,
      graphConfig: customGraphConfig,
      sixDofState: {
        activeModelId: 'aim9x-cad',
        mWrtLConfig: {
          parentAircraftTrackId: 'wing-pylon-ref',
          launchHookOffsetBody: { x: 1.2, y: -0.45, z: 0.0 },
          launchAttitudeEulerDeg: { roll: 0, pitch: -2.0, yaw: 0 },
        },
        virtualPoints: [
          { id: 'vp-nose', label: 'Seeker Dome Tip', bodyCoords: { x: 1.51, y: 0, z: 0 } },
          { id: 'vp-tail', label: 'Nozzle Exit Center', bodyCoords: { x: -1.51, y: 0, z: 0 } },
        ],
      },
      tracks: [
        {
          id: 'store-track-6dof',
          name: 'AIM-9X Telemetry',
          color: '#2563EB',
          mass: 85.3,
          footprint: 'circle',
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
          steps: steps6Dof,
        },
      ],
    });

    const preSaveSeries = deriveSixChannelSeries(
      projectPreSave.tracks[0].steps,
      projectPreSave.graphConfig!,
      true,
      {
        mode: '6DOF',
        focalLengthPx: 1800,
        objectDistanceM: 12.5,
        characteristicWingSpanM: 0.64,
        meanReprojectionRmsePx: 0.22,
        fps: 100,
      }
    );

    const trkString = JSON.stringify(projectPreSave, null, 2);
    const trkFile = new File([trkString], 'F18_AIM9X_Store_Separation_6DOF.trk', {
      type: 'application/json',
    });

    const restoredResult = await ingestWorkstationFile(trkFile);
    expect(restoredResult.valid).toBe(true);
    const restored = restoredResult.data!;

    expect(restored.analysisMode).toBe('6DOF');
    expect(restored.activeTrackId).toBe('store-track-6dof');
    expect(restored.tracks[0].steps).toHaveLength(steps6Dof.length);
    expect(restored.sixDofState?.mWrtLConfig.parentAircraftTrackId).toBe('wing-pylon-ref');
    expect(restored.sixDofState?.virtualPoints).toHaveLength(2);
    expect(restored.graphConfig?.signConventionMatrix?.pitch).toEqual({
      sign: -1,
      offset: 1.5,
      alwaysPositive: false,
    });

    const postRestoreSeries = deriveSixChannelSeries(
      restored.tracks[0].steps,
      restored.graphConfig!,
      true,
      {
        mode: '6DOF',
        focalLengthPx: 1800,
        objectDistanceM: 12.5,
        characteristicWingSpanM: 0.64,
        meanReprojectionRmsePx: 0.22,
        fps: 100,
      }
    );

    expect(postRestoreSeries.panel1ErrorReport.overallAccuracyPct).toBeCloseTo(
      preSaveSeries.panel1ErrorReport.overallAccuracyPct,
      6
    );
    expect(postRestoreSeries.panel1ErrorReport.rmsErrorPct).toBeCloseTo(
      preSaveSeries.panel1ErrorReport.rmsErrorPct,
      6
    );
    expect(postRestoreSeries.panel1ErrorReport.metrologyGrade).toBe(
      preSaveSeries.panel1ErrorReport.metrologyGrade
    );
  });

  it('3. ZIP Bundle Round-Trip Test: Universal ingestWorkstationFile magic-byte router detects PK header and unpacks .zip project bundle without JSON.parse error', async () => {
    const project3D = serializeProject({
      analysisMode: '3D',
      experimentTitle: 'Stereo_Ballistics_Bundle_Test',
      activeTrackId: 'track-stereo-1',
      tracks: [
        {
          id: 'track-stereo-1',
          name: 'Projectile 3D',
          color: '#EF4444',
          mass: 0.25,
          footprint: 'circle',
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
          steps: [
            { frame: 0, time: 0.0, px: 100, py: 200, x: 0.1, y: 0.2, z: 1.0 },
            { frame: 1, time: 0.02, px: 130, py: 215, x: 0.25, y: 0.35, z: 1.15 },
            { frame: 2, time: 0.04, px: 160, py: 235, x: 0.4, y: 0.48, z: 1.3 },
          ],
        },
      ],
    });

    const zip = new JSZip();
    zip.file('project.trk', JSON.stringify(project3D, null, 2));
    zip.file('camera1_sample.mp4', new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]));

    const zipUint8 = await zip.generateAsync({ type: 'uint8array' });
    const zipFile = new File([zipUint8], 'Stereo_Ballistics_Bundle_Test_project_bundle.zip', {
      type: 'application/zip',
    });

    expect(await isProjectFileOrBundle(zipFile)).toBe(true);

    const routed = await ingestWorkstationFile(zipFile);
    expect(routed.route).toBe('zip-bundle');
    expect(routed.valid).toBe(true);
    expect(routed.data?.analysisMode).toBe('3D');
    expect(routed.data?.experimentTitle).toBe('Stereo_Ballistics_Bundle_Test');
    expect(routed.data?.tracks[0].id).toBe('track-stereo-1');
    expect(routed.videoFileCam1).toBeDefined();
    expect(routed.videoFileCam1?.name).toBe('camera1_sample.mp4');
  });

  it('4. Refresh Hydration Lock Test: Auto-save routine before isHydrated === true is a strict no-op and never overwrites saved localStorage session', () => {
    const savedUserWork = serializeProject({
      analysisMode: '6DOF',
      experimentTitle: 'Critical_Analyzed_6DOF_Run',
      currentExpId: 'user-analyzed-run',
      activeTrackId: 'user-track-99',
      currentFrame: 42,
      tracks: [
        {
          id: 'user-track-99',
          name: 'Analyzed Store Trajectory',
          color: '#10B981',
          mass: 110,
          footprint: 'circle',
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
          steps: [
            { frame: 41, time: 0.41, px: 500, py: 310, x: 1.2, y: -0.4, z: 10.0 },
            { frame: 42, time: 0.42, px: 512, py: 325, x: 1.25, y: -0.48, z: 10.1 },
          ],
        },
      ],
    });

    // Save the user's real analyzed session while hydrated
    saveSessionToLocalStorage(savedUserWork, true);
    expect(globalThis.localStorage.getItem(AUTOSAVE_STORAGE_KEY_V2)).not.toBeNull();

    // Simulate app reload where initial mount is NOT yet hydrated (isHydrated = false)
    const hydrationController = createHydrationController(false);
    expect(hydrationController.isHydrated()).toBe(false);

    const defaultDemoState = serializeProject({
      analysisMode: '2D',
      experimentTitle: 'Default Projectile Sample',
      currentExpId: 'projectile',
      activeTrackId: 'track-1',
      currentFrame: 0,
      tracks: [],
    });

    // Attempt to auto-save default demo state before hydration completes
    const didSaveViaController = hydrationController.saveSessionIfHydrated(defaultDemoState);
    const didSaveDirect = saveSessionToLocalStorage(defaultDemoState, false);

    expect(didSaveViaController).toBe(false);
    expect(didSaveDirect).toBe(false);

    // Verify the user's analyzed work in localStorage was NOT overwritten
    const restoredAfterBlockedAutosave = loadSynchronousSessionSnapshot();
    expect(restoredAfterBlockedAutosave).not.toBeNull();
    expect(restoredAfterBlockedAutosave!.experimentTitle).toBe('Critical_Analyzed_6DOF_Run');
    expect(restoredAfterBlockedAutosave!.analysisMode).toBe('6DOF');
    expect(restoredAfterBlockedAutosave!.activeTrackId).toBe('user-track-99');
    expect(restoredAfterBlockedAutosave!.currentFrame).toBe(42);
    expect(restoredAfterBlockedAutosave!.tracks[0].steps).toHaveLength(2);
  });

  it('5. Classic OSP XML .trk Round-Trip: Parses Java Tracker XML .trk files via ingestWorkstationFile', async () => {
    const ospXml = `<?xml version="1.0" encoding="UTF-8"?>
<object class="org.opensourcephysics.cabrillo.tracker.TrackerPanel">
  <property name="videoclip" type="object">
    <object class="org.opensourcephysics.media.core.VideoClip">
      <property name="startframe" type="int">5</property>
      <property name="stepsize" type="int">1</property>
      <property name="framecount" type="int">25</property>
      <property name="dt" type="double">0.02</property>
    </object>
  </property>
  <property name="coords" type="object">
    <object class="org.opensourcephysics.media.core.ImageCoordSystem">
      <property name="x0" type="double">200.0</property>
      <property name="y0" type="double">300.0</property>
      <property name="imagescale" type="double">250.0</property>
    </object>
  </property>
  <property name="tracks" type="collection" class="java.util.ArrayList">
    <property name="item" type="object">
      <object class="org.opensourcephysics.cabrillo.tracker.PointMass">
        <property name="name" type="string">Pendulum Bob</property>
        <property name="mass" type="double">0.5</property>
        <property name="steps" type="array" class="[Lorg.opensourcephysics.cabrillo.tracker.Step;">
          <property name="[5]" type="object">
            <object class="org.opensourcephysics.cabrillo.tracker.PositionStep">
              <property name="x" type="double">250.0</property>
              <property name="y" type="double">250.0</property>
            </object>
          </property>
          <property name="[6]" type="object">
            <object class="org.opensourcephysics.cabrillo.tracker.PositionStep">
              <property name="x" type="double">275.0</property>
              <property name="y" type="double">240.0</property>
            </object>
          </property>
          <property name="[7]" type="object">
            <object class="org.opensourcephysics.cabrillo.tracker.PositionStep">
              <property name="x" type="double">300.0</property>
              <property name="y" type="double">225.0</property>
            </object>
          </property>
        </property>
      </object>
    </property>
  </property>
</object>`;

    const xmlFile = new File([ospXml], 'legacy_pendulum.trk', { type: 'text/xml' });
    const result = await ingestWorkstationFile(xmlFile);
    expect(result.route).toBe('osp-xml-trk');
    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.tracks[0].name).toBe('Pendulum Bob');
    expect(result.data!.tracks[0].steps).toHaveLength(3);
    expect(result.data!.tracks[0].steps[1].vx).toBeDefined();
    // Verify physics mass (0.5 kg) was used rather than dt (0.02 s)
    const midStep = result.data!.tracks[0].steps[1];
    expect(midStep.v).toBeGreaterThan(0);
    expect(midStep.kineticEnergy).toBeCloseTo(0.5 * 0.5 * (midStep.v! ** 2), 6);
  });

  it('6. Physics Mass Exactness: Reopening a 2.5 kg track recomputes kineticEnergy = 0.5 * 2.5 * v^2 (never dt)', () => {
    const rawPayload = {
      version: '2.0',
      analysisMode: '2D',
      experimentTitle: 'Heavy_Store_Drop_2p5kg',
      clip: { startFrame: 0, endFrame: 10, stepSize: 1, fps: 1000, startTime: 0, totalFrames: 11 },
      tracks: [
        {
          id: 'heavy-1',
          name: '2.5 kg Test Body',
          color: '#2563EB',
          mass: 2.5,
          // Deliberately omit vx/vy/v/kineticEnergy so parser recomputes via computeKinematics
          steps: [
            { frame: 0, time: 0.0, px: 100, py: 200, x: 0.0, y: 1.0 },
            { frame: 1, time: 0.1, px: 140, py: 200, x: 1.0, y: 1.0 },
            { frame: 2, time: 0.2, px: 180, py: 200, x: 2.0, y: 1.0 },
          ],
        },
      ],
    };

    const parsed = validateAndParseProject(rawPayload);
    expect(parsed.valid).toBe(true);
    const restoredTrack = parsed.data!.tracks[0];
    expect(restoredTrack.mass).toBe(2.5);
    const step1 = restoredTrack.steps[1];
    // Constant velocity vx = 10 m/s -> KE = 0.5 * 2.5 * 10^2 = 125 J (if dt=0.001 were passed, KE would be 0.05 J!)
    expect(step1.vx).toBeCloseTo(10.0, 5);
    expect(step1.v).toBeCloseTo(10.0, 5);
    expect(step1.kineticEnergy).toBeCloseTo(125.0, 4);
  });

  it('7. Partial Inactive 2D Calibration Stick: Preserves saved endpoints & worldLength with active: false verbatim', async () => {
    const trkJson = serializeProjectToTrk({
      analysisMode: '2D',
      experimentTitle: 'Partial_Stick_Draft',
      calibration: {
        active: false,
        pointA: { x: 112.5, y: 318.25 },
        pointB: { x: 488.75, y: 320.5 },
        x1: 112.5,
        y1: 318.25,
        x2: 488.75,
        y2: 320.5,
        realLength: 1.5,
        worldLength: 1.5,
        length: 1.5,
        unit: 'm',
        scale: 100,
        locked: false,
        visible: true,
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Mass A',
          color: '#2563EB',
          mass: 1.0,
          footprint: 'circle',
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
          steps: [],
        },
      ],
    });

    const trkFile = new File([trkJson], 'Partial_Stick_Draft.trk', { type: 'application/json' });
    const routed = await ingestWorkstationFile(trkFile);
    expect(routed.valid).toBe(true);
    const cal = routed.data!.calibration!;
    expect(cal.active).toBe(false);
    expect(cal.pointA).toEqual({ x: 112.5, y: 318.25 });
    expect(cal.pointB).toEqual({ x: 488.75, y: 320.5 });
    expect(cal.x1).toBe(112.5);
    expect(cal.y1).toBe(318.25);
    expect(cal.x2).toBe(488.75);
    expect(cal.y2).toBe(320.5);
    expect(cal.realLength).toBe(1.5);
    expect(cal.worldLength).toBe(1.5);
  });

  it('8. Phase 2 3D Multi-Rate (clipCam2 + canonical syncConfig + cam1Time/cam2Time) & 6-DOF Leica ACS Survey Markers Round-Trip', async () => {
    const project = serializeProject({
      analysisMode: '3D',
      experimentTitle: 'MultiRate_Stereo_And_Leica_ACS',
      activeTrackId: 'store-3d',
      clip: {
        startFrame: 120,
        endFrame: 620,
        stepSize: 2,
        fps: 1000,
        startTime: 0.0,
        frameDt: 0.001,
        dt: 0.001,
        totalFrames: 1000,
        userTrimmed: true,
      },
      triangulation: {
        method: 'dlt-2cam',
        pixelsPerMeterCam1: 310,
        pixelsPerMeterCam2: 295,
        originCam1: { x: 640, y: 360 },
        originCam2: { x: 640, y: 360 },
        baselineMeters: 2.4,
        convergenceAngleDeg: 68,
        calibrated: true,
        fpsCam1: 1000,
        fpsCam2: 250,
        clipCam2: {
          startFrame: 30,
          endFrame: 180,
          stepSize: 1,
          fps: 250,
          startTime: 0.0,
          frameDt: 0.004,
          dt: 0.004,
          totalFrames: 300,
          userTrimmed: true,
        },
        syncConfig: {
          anchorFrameCam1: 120,
          anchorFrameCam2: 30,
          fpsCam1: 1000,
          fpsCam2: 250,
          toleranceSec: 0.003,
          playbackMaster: 'cam1',
        },
      },
      sixDofState: {
        intrinsics: {
          fx: 1750,
          fy: 1752,
          cx: 642,
          cy: 358,
          distortion: { enabled: true, k1: -0.02, k2: 0.004, k3: 0, p1: 0.0002, p2: -0.0001 },
        },
        markers: [
          { id: 'A1', group: 'A', x: 0.0, y: 0.0, z: 0.0 },
          { id: 'L7', group: 'L', x: 0.4, y: -0.22, z: 0.03 },
          { id: 'M15', group: 'M', x: 0.85, y: -0.45, z: 0.12 },
        ],
        csvText: 'A1,A,0,0,0\nL7,L,0.4,-0.22,0.03\nM15,M,0.85,-0.45,0.12',
        missileCgBody: [0.12, -0.04, 0.02],
        huberDeltaPx: 3.0,
      },
      tracks: [
        {
          id: 'store-3d',
          name: 'Store 3D',
          color: '#2563EB',
          mass: 4.0,
          footprint: 'circle',
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
          steps: [
            {
              frame: 120,
              time: 0.0,
              px: 512,
              py: 300,
              cam1Px: 512,
              cam1Py: 300,
              cam2Px: 498,
              cam2Py: 304,
              cam1Time: 0.0,
              cam2Time: 0.0,
              cam2Frame: 30,
              x: 0.0,
              y: 0.0,
              z: 5.0,
            },
            {
              frame: 124,
              time: 0.004,
              px: 520,
              py: 308,
              cam1Px: 520,
              cam1Py: 308,
              cam2Px: 504,
              cam2Py: 311,
              cam1Time: 0.004,
              cam2Time: 0.004,
              cam2Frame: 31,
              x: 0.08,
              y: -0.02,
              z: 5.04,
            },
          ],
        },
      ],
    });

    const validated = serializeAndValidateTrk(project);
    expect(validated.valid).toBe(true);
    if (!validated.valid) throw new Error('Expected valid .trk');
    expect(validated.trkString).toBeDefined();

    const restored = validated.data;
    expect(restored.clip.startFrame).toBe(120);
    expect(restored.clip.endFrame).toBe(620);
    expect(restored.clip.userTrimmed).toBe(true);
    expect(restored.triangulation?.clipCam2?.startFrame).toBe(30);
    expect(restored.triangulation?.clipCam2?.endFrame).toBe(180);
    expect(restored.triangulation?.clipCam2?.fps).toBe(250);
    expect(restored.triangulation?.clipCam2?.userTrimmed).toBe(true);
    expect(restored.triangulation?.syncConfig).toEqual({
      anchorFrameCam1: 120,
      anchorFrameCam2: 30,
      fpsCam1: 1000,
      fpsCam2: 250,
      toleranceSec: 0.003,
      playbackMaster: 'cam1',
    });
    expect(restored.tracks[0].steps[1].cam1Time).toBeCloseTo(0.004, 6);
    expect(restored.tracks[0].steps[1].cam2Time).toBeCloseTo(0.004, 6);
    expect(restored.tracks[0].steps[1].cam2Frame).toBe(31);
    expect(restored.sixDofState?.intrinsics?.fx).toBe(1750);
    expect(restored.sixDofState?.markers?.map((m) => m.id)).toEqual(['A1', 'L7', 'M15']);
    expect(restored.sixDofState?.missileCgBody).toEqual([0.12, -0.04, 0.02]);
    expect(restored.sixDofState?.huberDeltaPx).toBe(3.0);
  });

  it('9. Reversed-Order Dual-Camera .ZIP Matching & MIME Inference: Maps Cam 1 AVI and Cam 2 MP4 strictly by project.trk metadata', async () => {
    const project3D = serializeProject({
      analysisMode: '3D',
      experimentTitle: 'Reversed_Order_Stereo_ZIP',
      videoNameCam1: 'cam1_drop.avi',
      videoNameCam2: 'cam2_side.mp4',
      tracks: [],
    });

    const zip = new JSZip();
    // Deliberately add Cam 2 BEFORE Cam 1 in ZIP entry order
    zip.file('cam2_side.mp4', new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]));
    zip.file('cam1_drop.avi', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00]));
    zip.file('project.trk', JSON.stringify(project3D, null, 2));

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const zipFile = new File([zipBytes], 'Reversed_Order_Stereo.zip', { type: 'application/zip' });

    const routed = await ingestWorkstationFile(zipFile);
    expect(routed.valid).toBe(true);
    expect(routed.route).toBe('zip-bundle');
    expect(routed.videoFileCam1?.name).toBe('cam1_drop.avi');
    expect(routed.videoFileCam1?.type).toBe('video/x-msvideo');
    expect(routed.videoFileCam2?.name).toBe('cam2_side.mp4');
    expect(routed.videoFileCam2?.type).toBe('video/mp4');
    expect(inferMediaMimeTypeFromFilename('highspeed.mov')).toBe('video/quicktime');
  });

  it('10. Dual-Camera Same-Filename Collision Protection: Disambiguates colliding VID_0001.avi filenames and restores both streams accurately', async () => {
    const resolvedNames = resolveDualExportFilenames('VID_0001.avi', 'VID_0001.avi');
    expect(resolvedNames.collided).toBe(true);
    expect(resolvedNames.nameCam1).toBe('cam1_VID_0001.avi');
    expect(resolvedNames.nameCam2).toBe('cam2_VID_0001.avi');

    // Also verify nested relative paths (cam1/VID_0001.avi vs cam2/VID_0001.avi) match exact path first
    const project3D = serializeProject({
      analysisMode: '3D',
      experimentTitle: 'Collision_Protected_Stereo',
      videoNameCam1: 'cam1/VID_0001.avi',
      videoNameCam2: 'cam2/VID_0001.avi',
      tracks: [],
    });

    const cam1Bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x01, 0x01, 0x01]);
    const cam2Bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x02, 0x02, 0x02, 0x02]);
    const zip = new JSZip();
    zip.file('cam2/VID_0001.avi', cam2Bytes);
    zip.file('cam1/VID_0001.avi', cam1Bytes);
    zip.file('project.trk', JSON.stringify(project3D, null, 2));

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const zipFile = new File([zipBytes], 'Collision_Protected_Stereo.zip', { type: 'application/zip' });

    const routed = await ingestWorkstationFile(zipFile);
    expect(routed.valid).toBe(true);
    expect(routed.videoFileCam1).toBeDefined();
    expect(routed.videoFileCam2).toBeDefined();
    expect(routed.videoFileCam1!.type).toBe('video/x-msvideo');
    expect(routed.videoFileCam2!.type).toBe('video/x-msvideo');
    const restoredCam1Buf = new Uint8Array(await routed.videoFileCam1!.arrayBuffer());
    const restoredCam2Buf = new Uint8Array(await routed.videoFileCam2!.arrayBuffer());
    expect(restoredCam1Buf[4]).toBe(0x01);
    expect(restoredCam2Buf[4]).toBe(0x02);
  });

  it('11. Image-Sequence ZIP Disambiguation, VideoFormat .trk Guard & Pre-Download Self-Validation Failure', async () => {
    // 11a. .trk must NOT be classified as a binary ZIP archive in videoFormats.ts
    const dummyTrk = new File(['{"version":"2.0","tracks":[]}'], 'test_run.trk', {
      type: 'application/json',
    });
    expect(inspectVideoFile(dummyTrk).isArchive).toBe(false);

    // 11b. Numbered .png sequence ZIP routes cleanly to image-sequence without missing-.trk error
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const seqZip = new JSZip();
    seqZip.file('frames/frame_0001.png', pngHeader);
    seqZip.file('frames/frame_0002.png', pngHeader);
    seqZip.file('__MACOSX/frames/._frame_0001.png', pngHeader);
    const seqBytes = await seqZip.generateAsync({ type: 'uint8array' });
    const seqFile = new File([seqBytes], 'drop_frames.zip', { type: 'application/zip' });

    const routedSeq = await ingestWorkstationFile(seqFile);
    expect(routedSeq.kind).toBe('image-sequence');
    expect(routedSeq.route).toBe('zip-image-sequence');
    expect(routedSeq.zipImageEntries?.length).toBe(2);

    // 11c. Pre-download self-validation rejects malformed payloads with stage-tagged diagnostics
    const invalidPayload: any = {
      version: '2.0',
      clip: { startFrame: 0, endFrame: 10, fps: -5, stepSize: 1, startTime: 0, totalFrames: 11 },
      tracks: 'not-an-array',
    };
    const selfCheck = serializeAndValidateTrk(invalidPayload);
    expect(selfCheck.valid).toBe(false);
    if (selfCheck.valid) throw new Error('Expected invalid .trk selfCheck');
    expect(selfCheck.stage).toBe('Schema Validation');
    expect(selfCheck.error).toContain('[Stage: Schema Validation] — Exact Reason:');
  });
});
