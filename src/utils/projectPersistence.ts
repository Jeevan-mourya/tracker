/**
 * Tracker / Open Source Physics – Project Serialization & Persistence Engine
 * 
 * Provides robust, versioned project saving to file (.trk) or directory/folder,
 * schema validation, backward-compatibility migration, and media relinking.
 */

import { SavedProjectData, Track, ClipSettings, Calibration, CoordinateAxes, TriangulationConfig, StereoSyncConfig } from '../types';
import JSZip from 'jszip';

export const CURRENT_PROJECT_VERSION = '2.1.0';

export interface ParseProjectResult {
  valid: boolean;
  data?: SavedProjectData;
  error?: string;
  errors?: string[];
  warnings?: string[];
}

export interface SerializeProjectOptions {
  analysisMode: '2D' | '3D' | '6DOF';
  experimentTitle: string;
  currentExpId?: string;
  camera1?: {
    videoName?: string;
    videoUrl?: string;
    clip: ClipSettings;
    calibration: Calibration;
    origin: { x: number; y: number };
  };
  camera2?: {
    videoName?: string;
    videoUrl?: string;
    clip: ClipSettings;
    calibration: Calibration;
    origin: { x: number; y: number };
  };
  videoUrl?: string;
  videoUrlCam2?: string;
  videoNameCam1?: string;
  videoNameCam2?: string;
  clip?: ClipSettings;
  clipCam2?: ClipSettings;
  calibration?: Calibration;
  calibrationCam2?: Calibration;
  synchronization?: StereoSyncConfig;
  triangulation?: TriangulationConfig;
  axes: CoordinateAxes;
  tracks: Track[];
  graphConfig?: SavedProjectData['graphConfig'];
}

export interface SaveProjectResult {
  savedAsFolder: boolean;
  method: 'folder' | 'zip';
  pathOrName: string;
  filesWritten: string[];
}

/**
 * Serializes current workstation state into a canonical SavedProjectData object.
 */
export function serializeProject(params: SerializeProjectOptions): SavedProjectData {
  const is3D = params.analysisMode === '3D';

  const cam1Clip: ClipSettings = params.camera1?.clip || params.clip || {
    startFrame: 0,
    endFrame: 100,
    stepSize: 1,
    fps: 30,
    startTime: 0,
    frameDt: 1 / 30,
    dt: 1 / 30,
    totalFrames: 100,
  };

  const cam1Cal: Calibration = params.camera1?.calibration || params.calibration || {
    active: true,
    visible: true,
    locked: false,
    pointA: { x: 100, y: 100 },
    pointB: { x: 340, y: 100 },
    realLength: 1.0,
    unit: 'm',
    scale: 240,
  };

  const cam1Origin = params.camera1?.origin || params.triangulation?.originCam1 || { x: 320, y: 240 };

  const cam2Clip: ClipSettings | undefined = params.camera2?.clip || params.clipCam2 || (is3D ? {
    ...cam1Clip,
    fps: params.triangulation?.fpsCam2 || cam1Clip.fps,
  } : undefined);

  const cam2Cal: Calibration | undefined = params.camera2?.calibration || params.calibrationCam2 || params.triangulation?.calibrationCam2 || (is3D ? {
    ...cam1Cal,
    scale: params.triangulation?.pixelsPerMeterCam2 || cam1Cal.scale,
  } : undefined);

  const cam2Origin = params.camera2?.origin || params.triangulation?.originCam2 || { x: 320, y: 240 };

  const rawUrlCam1 = params.camera1?.videoUrl || params.videoUrl;
  const rawUrlCam2 = params.camera2?.videoUrl || params.videoUrlCam2;

  return {
    version: CURRENT_PROJECT_VERSION,
    analysisMode: params.analysisMode,
    timestamp: new Date().toISOString(),
    experimentTitle: params.experimentTitle || 'Untitled Tracking Project',
    currentExpId: params.currentExpId,
    camera1: {
      videoName: params.camera1?.videoName || params.videoNameCam1,
      videoUrl: rawUrlCam1?.startsWith('blob:') ? undefined : rawUrlCam1,
      clip: { ...cam1Clip },
      calibration: { ...cam1Cal },
      origin: { ...cam1Origin },
    },
    camera2: is3D && (cam2Cal || cam2Clip)
      ? {
          videoName: params.camera2?.videoName || params.videoNameCam2,
          videoUrl: rawUrlCam2?.startsWith('blob:') ? undefined : rawUrlCam2,
          clip: { ...(cam2Clip || cam1Clip) },
          calibration: { ...(cam2Cal || cam1Cal) },
          origin: { ...cam2Origin },
        }
      : undefined,
    synchronization: params.synchronization ? { ...params.synchronization } : params.triangulation?.syncConfig,
    triangulation: params.triangulation ? { ...params.triangulation } : undefined,
    // Top-level backward compatibility
    calibration: { ...cam1Cal },
    clip: { ...cam1Clip },
    axes: { ...params.axes },
    tracks: params.tracks.map((trk) => ({
      ...trk,
      steps: trk.steps.map((s) => ({ ...s })),
    })),
    graphConfig: params.graphConfig ? { ...params.graphConfig } : undefined,
  };
}

/**
 * Validates and deserializes incoming project JSON.
 * Protects open project by returning error result rather than throwing or partially overwriting state.
 */
export function validateAndParseProject(jsonStringOrObj: string | any): ParseProjectResult {
  let parsed: any;
  if (typeof jsonStringOrObj === 'string') {
    try {
      parsed = JSON.parse(jsonStringOrObj);
    } catch (err: any) {
      const msg = `JSON syntax error: ${err?.message || 'Corrupted file content'}`;
      return {
        valid: false,
        error: msg,
        errors: [msg],
      };
    }
  } else {
    parsed = jsonStringOrObj;
  }

  if (!parsed || typeof parsed !== 'object') {
    const msg = 'Project data must be a valid JSON object.';
    return { valid: false, error: msg, errors: [msg] };
  }

  // Validate tracks
  if (!Array.isArray(parsed.tracks)) {
    const msg = "Missing required 'tracks' array in project data.";
    return { valid: false, error: msg, errors: [msg] };
  }

  // Validate each track structure
  for (let tIdx = 0; tIdx < parsed.tracks.length; tIdx++) {
    const trk = parsed.tracks[tIdx];
    if (!trk || typeof trk !== 'object' || !Array.isArray(trk.steps)) {
      const msg = `Track at index ${tIdx} is malformed or missing steps array.`;
      return {
        valid: false,
        error: msg,
        errors: [msg],
      };
    }
  }

  const warnings: string[] = [];

  // Backward compatibility migration for v1.0.0 and v2.0.0
  const is6DOF = parsed.analysisMode === '6DOF';
  const is3D = !is6DOF && (parsed.analysisMode === '3D' || Boolean(parsed.triangulation));

  const camera1Clip: ClipSettings = parsed.camera1?.clip || parsed.clip || {
    startFrame: 0,
    endFrame: 100,
    stepSize: 1,
    fps: 30,
    startTime: 0,
    frameDt: 1 / 30,
    dt: 1 / 30,
    totalFrames: 100,
  };

  const camera1Cal: Calibration = parsed.camera1?.calibration || parsed.calibration || {
    active: true,
    visible: true,
    locked: false,
    pointA: { x: 100, y: 100 },
    pointB: { x: 340, y: 100 },
    realLength: 1.0,
    unit: 'm',
    scale: 240,
  };

  const camera1Origin = parsed.camera1?.origin || parsed.triangulation?.originCam1 || { x: 320, y: 240 };

  const camera2Clip: ClipSettings | undefined = parsed.camera2?.clip || (is3D ? {
    ...camera1Clip,
    fps: parsed.triangulation?.fpsCam2 || camera1Clip.fps,
  } : undefined);

  const camera2Cal: Calibration | undefined = parsed.camera2?.calibration || parsed.triangulation?.calibrationCam2 || (is3D ? {
    ...camera1Cal,
    scale: parsed.triangulation?.pixelsPerMeterCam2 || camera1Cal.scale,
  } : undefined);

  const camera2Origin = parsed.camera2?.origin || parsed.triangulation?.originCam2 || { x: 320, y: 240 };

  const synchronization: StereoSyncConfig | undefined = parsed.synchronization || parsed.triangulation?.syncConfig || (is3D ? {
    anchorFrameCam1: parsed.clip?.startFrame || 0,
    anchorFrameCam2: parsed.clip?.startFrame || 0,
    fpsCam1: parsed.triangulation?.fpsCam1 || camera1Clip.fps,
    fpsCam2: parsed.triangulation?.fpsCam2 || camera1Clip.fps,
    toleranceSec: 0.005,
    playbackMaster: 'cam1',
  } : undefined);

  const axes: CoordinateAxes = parsed.axes || {
    origin: { x: 320, y: 240 },
    angle: 0,
    visible: true,
    locked: false,
    gridVisible: false,
  };

  // Media presence check
  if (!parsed.camera1?.videoUrl && !parsed.videoUrl && !parsed.camera1?.videoName) {
    warnings.push('Camera 1 source video is not embedded. User may relink local video file.');
  }

  const normalizedProject: SavedProjectData = {
    version: parsed.version || '2.0.0',
    analysisMode: is6DOF ? '6DOF' : is3D ? '3D' : '2D',
    timestamp: parsed.timestamp || new Date().toISOString(),
    experimentTitle: parsed.experimentTitle || 'Imported Tracking Project',
    currentExpId: parsed.currentExpId,
    camera1: {
      videoName: parsed.camera1?.videoName || parsed.videoNameCam1 || parsed.experimentTitle,
      videoUrl: parsed.camera1?.videoUrl || parsed.videoUrl,
      clip: camera1Clip,
      calibration: camera1Cal,
      origin: camera1Origin,
    },
    camera2: is3D && camera2Cal && camera2Clip ? {
      videoName: parsed.camera2?.videoName || parsed.videoNameCam2,
      videoUrl: parsed.camera2?.videoUrl || parsed.videoUrlCam2,
      clip: camera2Clip,
      calibration: camera2Cal,
      origin: camera2Origin,
    } : undefined,
    synchronization,
    triangulation: parsed.triangulation,
    calibration: camera1Cal,
    clip: camera1Clip,
    axes,
    tracks: parsed.tracks,
    graphConfig: parsed.graphConfig,
  };

  return {
    valid: true,
    data: normalizedProject,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Generates kinematic CSV string for all steps across tracks.
 */
export function generateKinematicsCSV(tracks: Track[]): string {
  const activeTrack = tracks[0];
  if (!activeTrack || activeTrack.steps.length === 0) return 'Frame,Time_s,x_m,y_m\n';

  const hasZ = activeTrack.steps.some((s) => s.z !== undefined);
  const headers = hasZ
    ? [
        'Frame', 'Time_s', 'x_m', 'y_m', 'z_m',
        'u1_px', 'v1_px', 'u2_px', 'v2_px',
        'reprojection_residual_px', 'vx_mps', 'vy_mps', 'vz_mps', 'speed_mps',
        'ax_mps2', 'ay_mps2', 'az_mps2', 'accel_mag_mps2'
      ]
    : [
        'Frame', 'Time_s', 'x_m', 'y_m', 'u_px', 'v_px',
        'vx_mps', 'vy_mps', 'speed_mps', 'ax_mps2', 'ay_mps2', 'accel_mag_mps2'
      ];

  const rows = activeTrack.steps.map((s) => {
    const base = [
      s.frame,
      s.time.toFixed(5),
      s.x.toFixed(5),
      s.y.toFixed(5),
    ];
    if (hasZ) {
      base.push((s.z ?? 0).toFixed(5));
      base.push(
        s.cam1?.px != null ? s.cam1.px.toString() : (s.cam1Px != null ? s.cam1Px.toString() : ''),
        s.cam1?.py != null ? s.cam1.py.toString() : (s.cam1Py != null ? s.cam1Py.toString() : ''),
        s.cam2?.px != null ? s.cam2.px.toString() : (s.cam2Px != null ? s.cam2Px.toString() : ''),
        s.cam2?.py != null ? s.cam2.py.toString() : (s.cam2Py != null ? s.cam2Py.toString() : ''),
        s.triangulationResidual != null ? s.triangulationResidual.toFixed(3) : (s.residual != null ? s.residual.toFixed(3) : '')
      );
    } else {
      base.push(s.px.toString(), s.py.toString());
    }
    base.push(
      s.vx != null ? s.vx.toFixed(4) : '',
      s.vy != null ? s.vy.toFixed(4) : ''
    );
    if (hasZ) {
      base.push(s.vz != null ? s.vz.toFixed(4) : '');
    }
    base.push(
      s.v != null ? s.v.toFixed(4) : '',
      s.ax != null ? s.ax.toFixed(4) : '',
      s.ay != null ? s.ay.toFixed(4) : ''
    );
    if (hasZ) {
      base.push(s.az != null ? s.az.toFixed(4) : '');
    }
    base.push(s.a != null ? s.a.toFixed(4) : '');
    return base.join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Saves project to a directory folder using File System Access API where available,
 * or packages into a ZIP bundle archive as fallback.
 */
export async function saveProjectToFolderOrBundle(
  projectOrOptions: SavedProjectData | SerializeProjectOptions
): Promise<SaveProjectResult> {
  const projectData: SavedProjectData = 'version' in projectOrOptions && 'timestamp' in projectOrOptions
    ? (projectOrOptions as SavedProjectData)
    : serializeProject(projectOrOptions as SerializeProjectOptions);

  const safeName = (projectData.experimentTitle || 'tracker_project').replace(/[^a-zA-Z0-9_-]/g, '_');
  const projectJson = JSON.stringify(projectData, null, 2);
  const csvContent = generateKinematicsCSV(projectData.tracks);

  const readme = [
    `Tracker / Open Source Physics – 3D Analysis Project`,
    `=====================================================`,
    `Title:        ${projectData.experimentTitle}`,
    `Date:         ${projectData.timestamp}`,
    `Version:      ${projectData.version}`,
    `Analysis:     ${projectData.analysisMode}`,
    `Tracks:       ${projectData.tracks.length} track(s)`,
    `Total Points: ${projectData.tracks.reduce((acc, t) => acc + t.steps.length, 0)} observation(s)`,
    ``,
    `Files in this Project Directory:`,
    `- project.trk        : Complete serialized project dataset & stereo configuration`,
    `- tracking_data.csv  : Exported kinematics data table`,
    `- README_PROJECT.txt : This project summary`,
  ].join('\n');

  const filesWritten = ['project.trk', 'tracking_data.csv', 'README_PROJECT.txt'];

  // Attempt File System Access API if supported
  if (typeof (window as any).showDirectoryPicker === 'function') {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });

      // Write project.trk
      const fileHandleTrk = await dirHandle.getFileHandle('project.trk', { create: true });
      const writableTrk = await fileHandleTrk.createWritable();
      await writableTrk.write(projectJson);
      await writableTrk.close();

      // Write tracking_data.csv
      const fileHandleCsv = await dirHandle.getFileHandle('tracking_data.csv', { create: true });
      const writableCsv = await fileHandleCsv.createWritable();
      await writableCsv.write(csvContent);
      await writableCsv.close();

      // Write README_PROJECT.txt
      const fileHandleReadme = await dirHandle.getFileHandle('README_PROJECT.txt', { create: true });
      const writableReadme = await fileHandleReadme.createWritable();
      await writableReadme.write(readme);
      await writableReadme.close();

      return {
        savedAsFolder: true,
        method: 'folder',
        pathOrName: dirHandle.name || 'Selected Folder',
        filesWritten,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err; // User cancelled
      }
      console.warn('Directory Picker encountered issue, falling back to ZIP archive bundle:', err);
    }
  }

  // Fallback: Generate ZIP bundle containing project.trk + tracking_data.csv + README_PROJECT.txt
  const zip = new JSZip();
  zip.file('project.trk', projectJson);
  zip.file('tracking_data.csv', csvContent);
  zip.file('README_PROJECT.txt', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `${safeName}_project_bundle.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  a.click();
  URL.revokeObjectURL(url);

  return {
    savedAsFolder: false,
    method: 'zip',
    pathOrName: zipFilename,
    filesWritten,
  };
}
