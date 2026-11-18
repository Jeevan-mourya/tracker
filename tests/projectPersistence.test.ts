import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import {
  serializeProject,
  serializeProjectToTrk,
  validateAndParseProject,
  ingestWorkstationFile,
  isProjectFileOrBundle,
  saveSessionToLocalStorage,
  loadSynchronousSessionSnapshot,
  createHydrationController,
  AUTOSAVE_STORAGE_KEY_V2,
} from '../src/utils/projectPersistence';
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
  });
});
