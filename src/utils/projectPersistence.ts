/**
 * Tracker / Open Source Physics – Project Serialization, Multi-Format .TRK/.ZIP/.TRZ Parser,
 * Universal Magic-Byte Router & Bulletproof Session Persistence Engine
 *
 * Implements:
 * 1. Hydration Lock & Synchronous/Async Session Persistence (`tracker_autosave_session_v2` + `IndexedDB`)
 * 2. Zero-Crash Recursive Sanitizer (`sanitizeProjectPayload`) on both Save & Load
 * 3. Universal Magic-Byte File Router (`ingestWorkstationFile`)
 * 4. Graceful Video Relinking via IndexedDB LRU Cache (`video_cache_${fileName}_${fileSize}`)
 */

import {
  SavedProjectData,
  Track,
  ClipSettings,
  Calibration,
  CoordinateAxes,
  TriangulationConfig,
  StereoSyncConfig,
  PointStep,
  VideoTelemetryMetadata,
} from '../types';
import { computeKinematics, pixelToWorld } from './physics';
import { computeKinematics3D } from './triangulation';
import { normalizeStereoSyncConfig } from './stereoSync';
import JSZip from 'jszip';
import {
  filterAndSortZipImageEntries,
  LazyZipImageEntry,
} from '../video/imageSequenceLoader';

export const CURRENT_PROJECT_VERSION = '2.1.0';
export const AUTOSAVE_STORAGE_KEY_V2 = 'tracker_autosave_session_v2';
export const AUTOSAVE_STORAGE_KEY = 'tracker_autosave_session';
const IDB_DB_NAME = 'tracker_defense_workspace_db';
const IDB_DB_VERSION = 1;
const IDB_STORE_PROJECT = 'project_state';
const IDB_STORE_MEDIA = 'video_media';

export type ProjectErrorStage =
  | 'File Read'
  | 'Magic-Byte Router'
  | 'JSON/ZIP Parse'
  | 'Schema Validation'
  | 'Media Hydrate';

export function formatProjectStageError(stage: ProjectErrorStage, reason: string): string {
  const cleanReason = (reason || 'Unknown error').trim();
  if (cleanReason.startsWith('[Stage:')) {
    return cleanReason;
  }
  return `[Stage: ${stage}] — Exact Reason: ${cleanReason}`;
}

export function inferMediaMimeTypeFromFilename(fileName: string): string {
  const clean = (fileName || '').trim().toLowerCase();
  const dotIdx = clean.lastIndexOf('.');
  const ext = dotIdx >= 0 ? clean.slice(dotIdx) : '';
  switch (ext) {
    case '.avi':
      return 'video/x-msvideo';
    case '.mov':
    case '.qt':
      return 'video/quicktime';
    case '.wmv':
    case '.asf':
      return 'video/x-ms-wmv';
    case '.flv':
    case '.f4v':
      return 'video/x-flv';
    case '.ogg':
    case '.ogv':
      return 'video/ogg';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.mpg':
    case '.mpeg':
      return 'video/mpeg';
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.gif':
      return 'image/gif';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

export function resolveDualExportFilenames(
  cam1Name?: string,
  cam2Name?: string
): { nameCam1?: string; nameCam2?: string; collided: boolean } {
  const cleanBase = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    const base = raw.replace(/\\/g, '/').split('/').pop()?.trim();
    return base || undefined;
  };
  const base1 = cleanBase(cam1Name);
  const base2 = cleanBase(cam2Name);
  if (base1 && base2 && base1.toLowerCase() === base2.toLowerCase()) {
    return {
      nameCam1: `cam1_${base1}`,
      nameCam2: `cam2_${base2}`,
      collided: true,
    };
  }
  return {
    nameCam1: base1,
    nameCam2: base2,
    collided: false,
  };
}

export interface ParseProjectResult {
  valid: boolean;
  data?: SavedProjectData;
  videoFileCam1?: File;
  videoFileCam2?: File;
  zipImageEntries?: LazyZipImageEntry[];
  archiveFileName?: string;
  stage?: ProjectErrorStage;
  error?: string;
  errors?: string[];
  warnings?: string[];
}

export interface IngestedWorkstationFileResult extends Partial<ParseProjectResult> {
  kind: 'project' | 'video' | 'image-sequence';
  route: 'zip-bundle' | 'zip-image-sequence' | 'json-trk' | 'osp-xml-trk' | 'video-decoder';
  projectResult?: ParseProjectResult;
  videoFile?: File;
  zipImageEntries?: LazyZipImageEntry[];
  archiveFileName?: string;
}

export interface SerializeProjectOptions {
  analysisMode: '2D' | '3D' | '6DOF';
  experimentTitle: string;
  currentExpId?: string;
  activeTrackId?: string;
  currentFrame?: number;
  isSynthetic?: boolean;
  syntheticType?: string;
  videoMetadata?: VideoTelemetryMetadata;
  videoMetadataCam2?: VideoTelemetryMetadata;
  sixDofState?: SavedProjectData['sixDofState'];
  camera1?: {
    videoName?: string;
    videoUrl?: string;
    clip: ClipSettings;
    calibration: Calibration;
    origin: { x: number; y: number };
    videoMetadata?: VideoTelemetryMetadata;
  };
  camera2?: {
    videoName?: string;
    videoUrl?: string;
    clip: ClipSettings;
    calibration: Calibration;
    origin: { x: number; y: number };
    videoMetadata?: VideoTelemetryMetadata;
  };
  videoUrl?: string;
  videoUrlCam2?: string;
  videoNameCam1?: string;
  videoNameCam2?: string;
  videoFileCam1?: File | null;
  videoFileCam2?: File | null;
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
  omittedVideos?: string[];
}

const OPTIONAL_NUMERIC_STEP_KEYS: Array<keyof PointStep> = [
  'z',
  'vx',
  'vy',
  'vz',
  'v',
  'ax',
  'ay',
  'az',
  'a',
  'kineticEnergy',
  'potentialEnergy',
  'totalEnergy',
  'roll',
  'pitch',
  'yaw',
  'omegaRoll',
  'omegaPitch',
  'omegaYaw',
  'alphaRoll',
  'alphaPitch',
  'alphaYaw',
  'sigmaX',
  'sigmaY',
  'sigmaZ',
  'sigmaRoll',
  'sigmaPitch',
  'sigmaYaw',
  'reprojectionRMSE',
  'errorPct',
  'accuracyPct',
  'residualAbs',
  'triangulationResidual',
  'residual',
  'reconstructionError3D',
  'cam1Px',
  'cam1Py',
  'cam2Px',
  'cam2Py',
  'cam1Time',
  'cam2Time',
  'cam2Frame',
  'temporalDeltaSeconds',
  'markerCountA',
  'markerCountL',
  'markerCountM',
];

/**
 * Normalizes a Calibration object while preserving partial (inactive) 2D calibration stick
 * endpoints (`pointA`/`pointB` and `x1, y1, x2, y2`) and `realLength`/`worldLength` verbatim
 * without auto-activating or auto-overwriting `scale` before the user finalizes calibration.
 */
function normalizeCalibrationForPersistence(
  rawCal: any,
  fallback?: Calibration
): Calibration {
  const base: Calibration = fallback || {
    active: true,
    visible: true,
    locked: false,
    pointA: { x: 100, y: 100 },
    pointB: { x: 340, y: 100 },
    realLength: 1.0,
    unit: 'm',
    scale: 240,
  };

  if (!rawCal || typeof rawCal !== 'object') {
    return {
      ...base,
      x1: base.pointA.x,
      y1: base.pointA.y,
      x2: base.pointB.x,
      y2: base.pointB.y,
      worldLength: base.realLength,
    };
  }

  const pickNum = (...candidates: unknown[]): number | undefined => {
    for (const c of candidates) {
      if (c === null || c === undefined || c === '') continue;
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const x1 = pickNum(rawCal.pointA?.x, rawCal.p1?.x, rawCal.x1, base.pointA.x) ?? 100;
  const y1 = pickNum(rawCal.pointA?.y, rawCal.p1?.y, rawCal.y1, base.pointA.y) ?? 100;
  const x2 = pickNum(rawCal.pointB?.x, rawCal.p2?.x, rawCal.x2, base.pointB.x) ?? 340;
  const y2 = pickNum(rawCal.pointB?.y, rawCal.p2?.y, rawCal.y2, base.pointB.y) ?? 100;
  const realLength =
    pickNum(rawCal.realLength, rawCal.worldLength, rawCal.length, base.realLength) ?? 1.0;

  // Respect partial inactive calibration stick: never auto-activate or fabricate a finalized scale
  const active = rawCal.active !== undefined ? Boolean(rawCal.active) : base.active;
  const rawScale = pickNum(rawCal.scale, rawCal.pixelsPerMeter);
  const scale =
    rawScale !== undefined
      ? rawScale
      : active
      ? base.scale
      : 0;

  const validUnit =
    rawCal.unit === 'm' || rawCal.unit === 'cm' || rawCal.unit === 'mm' || rawCal.unit === 'ft'
      ? rawCal.unit
      : base.unit;

  return {
    ...rawCal,
    active,
    visible: rawCal.visible !== undefined ? Boolean(rawCal.visible) : base.visible,
    locked: rawCal.locked !== undefined ? Boolean(rawCal.locked) : base.locked,
    pointA: { x: x1, y: y1 },
    pointB: { x: x2, y: y2 },
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    x1,
    y1,
    x2,
    y2,
    realLength,
    worldLength: realLength,
    length: realLength,
    unit: validUnit,
    scale,
    pixelsPerMeter: rawCal.pixelsPerMeter !== undefined ? rawScale : scale,
  };
}

/**
 * Sanitizes a single PointStep so that:
 * - Required numeric fields (`frame`, `time`, `px`, `py`, `x`, `y`) are guaranteed finite numbers.
 * - Optional numeric fields that are `null`, `NaN`, `Infinity`, or `-Infinity` are converted to `undefined`
 *   so no downstream component ever crashes calling `.toFixed()` on `null`.
 */
export function sanitizePointStep(
  rawStep: any,
  fallbackDt = 1 / 30,
  startFrame = 0,
  axes?: CoordinateAxes,
  calibration?: Calibration
): PointStep {
  if (!rawStep || typeof rawStep !== 'object') {
    return {
      frame: 0,
      time: 0,
      px: 0,
      py: 0,
      x: 0,
      y: 0,
    };
  }

  const clone: Record<string, any> = { ...rawStep };

  const toFiniteOrUndefined = (val: unknown): number | undefined => {
    if (val === null || val === undefined || val === '') return undefined;
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(num) ? num : undefined;
  };

  const frame = toFiniteOrUndefined(clone.frame) ?? 0;
  const safeDt = Number.isFinite(fallbackDt) && fallbackDt > 0 ? fallbackDt : 1 / 30;
  const time = toFiniteOrUndefined(clone.time) ?? (frame - startFrame) * safeDt;
  const px =
    toFiniteOrUndefined(clone.px) ??
    toFiniteOrUndefined(clone.cam1Px) ??
    toFiniteOrUndefined(clone.cam1?.px) ??
    0;
  const py =
    toFiniteOrUndefined(clone.py) ??
    toFiniteOrUndefined(clone.cam1Py) ??
    toFiniteOrUndefined(clone.cam1?.py) ??
    0;

  let x = toFiniteOrUndefined(clone.x);
  let y = toFiniteOrUndefined(clone.y);
  if (x === undefined || y === undefined) {
    if (axes && calibration) {
      const world = pixelToWorld(px, py, axes, calibration);
      if (x === undefined) x = Number.isFinite(world.x) ? world.x : 0;
      if (y === undefined) y = Number.isFinite(world.y) ? world.y : 0;
    } else {
      if (x === undefined) x = 0;
      if (y === undefined) y = 0;
    }
  }

  clone.frame = frame;
  clone.time = time;
  clone.px = px;
  clone.py = py;
  clone.x = x;
  clone.y = y;

  for (const key of OPTIONAL_NUMERIC_STEP_KEYS) {
    if (key in clone) {
      const cleanVal = toFiniteOrUndefined(clone[key]);
      if (cleanVal === undefined) {
        delete clone[key];
      } else {
        clone[key] = cleanVal;
      }
    }
  }

  // Also sanitize nested cam1 / cam2 pixel coordinates if present
  if (clone.cam1 && typeof clone.cam1 === 'object') {
    const c1x = toFiniteOrUndefined(clone.cam1.px);
    const c1y = toFiniteOrUndefined(clone.cam1.py);
    if (c1x !== undefined && c1y !== undefined) {
      clone.cam1 = { px: c1x, py: c1y };
    } else {
      delete clone.cam1;
    }
  }
  if (clone.cam2 && typeof clone.cam2 === 'object') {
    const c2x = toFiniteOrUndefined(clone.cam2.px);
    const c2y = toFiniteOrUndefined(clone.cam2.py);
    if (c2x !== undefined && c2y !== undefined) {
      clone.cam2 = { px: c2x, py: c2y };
    } else {
      delete clone.cam2;
    }
  }

  return clone as PointStep;
}

/**
 * Recursive sanitizer that cleans `null` / `NaN` / `Infinity` values on both save and load,
 * ensuring every Track has a valid `id`, `name`, `color`, and sanitized `steps: PointStep[]`.
 */
export function sanitizeProjectPayload(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;

  const payload = { ...raw };
  // Unwrap if nested under `.data` or `.project`
  if (!Array.isArray(payload.tracks)) {
    if (payload.data && Array.isArray(payload.data.tracks)) {
      return sanitizeProjectPayload(payload.data);
    }
    if (payload.project && Array.isArray(payload.project.tracks)) {
      return sanitizeProjectPayload(payload.project);
    }
  }

  const clipObj: ClipSettings | undefined = payload.camera1?.clip || payload.clip;
  const fps = Number.isFinite(Number(clipObj?.fps)) && Number(clipObj?.fps) > 0 ? Number(clipObj!.fps) : 30;
  const startFrame = Number.isFinite(Number(clipObj?.startFrame)) ? Number(clipObj!.startFrame) : 0;
  const dt = 1 / fps;

  if (Array.isArray(payload.tracks)) {
    payload.tracks = payload.tracks
      .filter((t: any) => t && typeof t === 'object')
      .map((trk: any, idx: number) => {
        const rawSteps = Array.isArray(trk.steps) ? trk.steps : [];
        const sanitizedSteps = rawSteps
          .filter((s: any) => s && typeof s === 'object')
          .map((s: any) =>
            sanitizePointStep(
              s,
              dt,
              startFrame,
              payload.axes,
              payload.camera1?.calibration || payload.calibration
            )
          );

        return {
          ...trk,
          id: typeof trk.id === 'string' && trk.id.trim() ? trk.id : `track-${idx + 1}`,
          name:
            typeof trk.name === 'string' && trk.name.trim()
              ? trk.name
              : `Mass ${String.fromCharCode(65 + idx)}`,
          color: typeof trk.color === 'string' && trk.color.trim() ? trk.color : '#3b82f6',
          mass:
            Number.isFinite(Number(trk.mass)) && Number(trk.mass) > 0
              ? Number(trk.mass)
              : 0.1,
          footprint: trk.footprint || 'circle',
          visible: trk.visible !== false,
          showVectors: trk.showVectors !== false,
          showTrails: trk.showTrails !== false,
          showLabels: trk.showLabels !== false,
          steps: sanitizedSteps,
        };
      });
  }

  return payload;
}

/**
 * Serializes current workstation state into a canonical SavedProjectData object.
 */
export function serializeProject(params: SerializeProjectOptions): SavedProjectData {
  const is3D = params.analysisMode === '3D';
  const is6DOF = params.analysisMode === '6DOF';

  const cam1Clip: ClipSettings = params.camera1?.clip ||
    params.clip || {
      startFrame: 0,
      endFrame: 100,
      stepSize: 1,
      fps: 30,
      startTime: 0,
      frameDt: 1 / 30,
      dt: 1 / 30,
      totalFrames: 100,
    };

  const cam1Cal: Calibration = normalizeCalibrationForPersistence(
    params.camera1?.calibration || params.calibration
  );

  const cam1Origin =
    params.camera1?.origin || params.triangulation?.originCam1 || { x: 320, y: 240 };

  const cam2Clip: ClipSettings | undefined =
    params.camera2?.clip ||
    params.clipCam2 ||
    params.triangulation?.clipCam2 ||
    (is3D
      ? {
          ...cam1Clip,
          fps: params.triangulation?.fpsCam2 || cam1Clip.fps,
        }
      : undefined);

  const cam2Cal: Calibration | undefined =
    params.camera2?.calibration ||
    params.calibrationCam2 ||
    params.triangulation?.calibrationCam2 ||
    (is3D
      ? {
          ...cam1Cal,
          scale: params.triangulation?.pixelsPerMeterCam2 || cam1Cal.scale,
        }
      : undefined);

  const cam2Origin =
    params.camera2?.origin || params.triangulation?.originCam2 || { x: 320, y: 240 };

  const rawUrlCam1 = params.camera1?.videoUrl || params.videoUrl;
  const rawUrlCam2 = params.camera2?.videoUrl || params.videoUrlCam2;

  const resolvedVideoNameCam1 =
    params.camera1?.videoName ||
    params.videoNameCam1 ||
    params.videoFileCam1?.name ||
    params.videoMetadata?.fileName ||
    (rawUrlCam1 && !rawUrlCam1.startsWith('blob:')
      ? rawUrlCam1.split('/').pop()
      : params.experimentTitle);

  const resolvedVideoNameCam2 =
    params.camera2?.videoName ||
    params.videoNameCam2 ||
    params.videoFileCam2?.name ||
    params.videoMetadataCam2?.fileName ||
    (rawUrlCam2 && !rawUrlCam2.startsWith('blob:')
      ? rawUrlCam2.split('/').pop()
      : undefined);

  const videoMetadataCam1: VideoTelemetryMetadata = params.videoMetadata ||
    params.camera1?.videoMetadata || {
      fileName: resolvedVideoNameCam1 || 'experiment_video.mp4',
      fileSize: params.videoFileCam1?.size,
      duration:
        (cam1Clip.totalFrames || Math.max(1, cam1Clip.endFrame - cam1Clip.startFrame + 1)) /
        Math.max(1, cam1Clip.fps || 30),
      width: 640,
      height: 480,
      sensorFps: cam1Clip.fps || 30,
      totalFrames:
        cam1Clip.totalFrames || Math.max(1, cam1Clip.endFrame - cam1Clip.startFrame + 1),
    };

  const videoMetadataCam2: VideoTelemetryMetadata | undefined =
    params.videoMetadataCam2 ||
    params.camera2?.videoMetadata ||
    (is3D && (resolvedVideoNameCam2 || params.videoFileCam2 || cam2Clip)
      ? {
          fileName: resolvedVideoNameCam2 || 'camera2_video.mp4',
          fileSize: params.videoFileCam2?.size,
          duration: cam2Clip
            ? (cam2Clip.totalFrames || Math.max(1, cam2Clip.endFrame - cam2Clip.startFrame + 1)) /
              Math.max(1, cam2Clip.fps || 30)
            : undefined,
          width: 640,
          height: 480,
          sensorFps: cam2Clip?.fps || params.triangulation?.fpsCam2 || cam1Clip.fps || 30,
          totalFrames:
            cam2Clip?.totalFrames ||
            Math.max(1, (cam2Clip?.endFrame ?? 100) - (cam2Clip?.startFrame ?? 0) + 1),
        }
      : undefined);

  const sanitizedTracks: Track[] = sanitizeProjectPayload({
    tracks: params.tracks,
    clip: cam1Clip,
    axes: params.axes,
    calibration: cam1Cal,
  }).tracks;

  const resolvedActiveTrackId =
    params.activeTrackId && sanitizedTracks.some((t) => t.id === params.activeTrackId)
      ? params.activeTrackId
      : sanitizedTracks[0]?.id || 'track-1';

  const sixDofPoseCount = sanitizedTracks.reduce(
    (acc, t) =>
      acc +
      t.steps.filter(
        (s) => s.roll !== undefined || s.pitch !== undefined || s.yaw !== undefined
      ).length,
    0
  );

  const sixDofState: SavedProjectData['sixDofState'] =
    params.sixDofState
      ? {
          referenceFrameMode: params.graphConfig?.referenceFrameMode || 'M_wrt_L',
          activeVirtualPointId: params.graphConfig?.activeVirtualPointId || 'vp-cg',
          coordConvention: params.graphConfig?.coordConvention || 'NED_Z_DOWN',
          channelSignConfig: params.graphConfig?.channelSignConfig,
          filterConfig: params.graphConfig?.filterConfig,
          poseCount: sixDofPoseCount,
          ...params.sixDofState,
        }
      : is6DOF || sixDofPoseCount > 0 || params.graphConfig
      ? {
          referenceFrameMode: params.graphConfig?.referenceFrameMode || 'M_wrt_L',
          activeVirtualPointId: params.graphConfig?.activeVirtualPointId || 'vp-cg',
          coordConvention: params.graphConfig?.coordConvention || 'NED_Z_DOWN',
          channelSignConfig: params.graphConfig?.channelSignConfig,
          filterConfig: params.graphConfig?.filterConfig,
          poseCount: sixDofPoseCount,
        }
      : undefined;

  const rawSync = params.synchronization || params.triangulation?.syncConfig;
  const canonicalSync: StereoSyncConfig | undefined =
    rawSync || is3D
      ? normalizeStereoSyncConfig(
          rawSync,
          params.triangulation?.fpsCam1 || cam1Clip.fps || 30,
          params.triangulation?.fpsCam2 || cam2Clip?.fps || cam1Clip.fps || 30
        )
      : undefined;

  const serializedTriangulation: TriangulationConfig | undefined = params.triangulation
    ? {
        ...params.triangulation,
        fpsCam1: params.triangulation.fpsCam1 || cam1Clip.fps,
        fpsCam2: params.triangulation.fpsCam2 || cam2Clip?.fps || cam1Clip.fps,
        clipCam2: cam2Clip ? { ...cam2Clip } : params.triangulation.clipCam2,
        syncConfig: canonicalSync,
      }
    : undefined;

  return {
    version: CURRENT_PROJECT_VERSION,
    analysisMode: params.analysisMode,
    timestamp: new Date().toISOString(),
    experimentTitle: params.experimentTitle || 'Untitled Tracking Project',
    currentExpId: params.currentExpId,
    activeTrackId: resolvedActiveTrackId,
    currentFrame: params.currentFrame ?? cam1Clip.startFrame ?? 0,
    isSynthetic: params.isSynthetic,
    syntheticType: params.syntheticType,
    videoMetadata: videoMetadataCam1,
    videoMetadataCam2,
    sixDofState,
    camera1: {
      videoName: resolvedVideoNameCam1,
      videoUrl: rawUrlCam1?.startsWith('blob:') ? undefined : rawUrlCam1,
      clip: { ...cam1Clip },
      calibration: { ...cam1Cal },
      origin: { ...cam1Origin },
      videoMetadata: videoMetadataCam1,
    },
    camera2:
      is3D && (cam2Cal || cam2Clip)
        ? {
            videoName: resolvedVideoNameCam2,
            videoUrl: rawUrlCam2?.startsWith('blob:') ? undefined : rawUrlCam2,
            clip: { ...(cam2Clip || cam1Clip) },
            calibration: normalizeCalibrationForPersistence(cam2Cal || cam1Cal),
            origin: { ...cam2Origin },
            videoMetadata: videoMetadataCam2,
          }
        : undefined,
    synchronization: canonicalSync,
    triangulation: serializedTriangulation,
    // Top-level backward compatibility
    calibration: { ...cam1Cal },
    clip: { ...cam1Clip },
    axes: { ...params.axes },
    tracks: sanitizedTracks,
    graphConfig: params.graphConfig ? { ...params.graphConfig } : undefined,
  };
}

/**
 * Serializes project state directly to a formatted, sanitized `.trk` JSON string
 * (converting any residual NaN/Infinity values cleanly to undefined before serialization).
 */
export function serializeProjectToTrk(
  projectOrOptions: SavedProjectData | SerializeProjectOptions
): string {
  const projectData: SavedProjectData =
    'version' in projectOrOptions && 'timestamp' in projectOrOptions
      ? sanitizeProjectPayload(projectOrOptions)
      : serializeProject(projectOrOptions as SerializeProjectOptions);

  return JSON.stringify(
    projectData,
    (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return undefined;
      }
      return value;
    },
    2
  );
}

/**
 * Pre-download self-validation gate: serializes project data to `.trk` JSON and immediately
 * runs `validateAndParseProject` in memory so the workstation can NEVER write an unloadable `.trk`.
 */
export function serializeAndValidateTrk(
  projectOrOptions: SavedProjectData | SerializeProjectOptions
):
  | { valid: true; trkString: string; data: SavedProjectData }
  | { valid: false; stage: ProjectErrorStage; error: string } {
  if (!projectOrOptions || typeof projectOrOptions !== 'object') {
    return {
      valid: false,
      stage: 'Schema Validation',
      error: formatProjectStageError('Schema Validation', 'Project payload is empty or not an object.'),
    };
  }

  const candidate = projectOrOptions as Record<string, any>;
  if (candidate.tracks !== undefined && !Array.isArray(candidate.tracks)) {
    return {
      valid: false,
      stage: 'Schema Validation',
      error: formatProjectStageError('Schema Validation', 'Project "tracks" field must be an array.'),
    };
  }
  if (
    candidate.clip &&
    typeof candidate.clip === 'object' &&
    candidate.clip.fps !== undefined &&
    (typeof candidate.clip.fps !== 'number' || !Number.isFinite(candidate.clip.fps) || candidate.clip.fps <= 0)
  ) {
    return {
      valid: false,
      stage: 'Schema Validation',
      error: formatProjectStageError(
        'Schema Validation',
        `Invalid clip.fps value (${String(candidate.clip.fps)}): must be a positive finite number.`
      ),
    };
  }

  let trkString: string;
  try {
    trkString = serializeProjectToTrk(projectOrOptions);
  } catch (err: any) {
    return {
      valid: false,
      stage: 'JSON/ZIP Parse',
      error: formatProjectStageError(
        'JSON/ZIP Parse',
        `Failed to serialize project payload: ${err?.message || 'Unserializable data'}`
      ),
    };
  }

  const check = validateAndParseProject(trkString);
  if (!check.valid || !check.data) {
    const stage: ProjectErrorStage = check.stage || 'Schema Validation';
    return {
      valid: false,
      stage,
      error: formatProjectStageError(
        stage,
        check.error || check.errors?.join('; ') || 'Serialized .trk payload failed validation'
      ),
    };
  }

  return {
    valid: true,
    trkString,
    data: check.data,
  };
}

/**
 * Parses a Classic Open Source Physics (OSP) Java Tracker XML `.trk` file
 * (`<object class="org.opensourcephysics.cabrillo.tracker.TrackerPanel">`)
 * into our canonical `SavedProjectData` format.
 */
function parseClassicOspTrackerXml(
  xmlText: string,
  fallbackTitle = 'OSP Tracker Import'
): ParseProjectResult {
  try {
    const videoNameMatch = xmlText.match(
      /<property name="path"[^>]*>\s*([^<\s][^<]*)\s*<\/property>/i
    );
    const rawVideoPath = videoNameMatch ? videoNameMatch[1].trim() : undefined;
    const videoName = rawVideoPath
      ? rawVideoPath.split(/[/\\]/).pop()
      : fallbackTitle;

    const extractNumProp = (propName: string, def: number): number => {
      const m = xmlText.match(
        new RegExp(
          `<property name="${propName}"[^>]*>\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*<\\/property>`,
          'i'
        )
      );
      return m ? Number(m[1]) : def;
    };

    const startFrame = Math.max(0, Math.round(extractNumProp('startframe', 0)));
    const stepSize = Math.max(1, Math.round(extractNumProp('stepsize', 1)));
    const frameCount = Math.max(10, Math.round(extractNumProp('framecount', 100)));
    const dtVal = extractNumProp('dt', 1 / 30);
    const fps = dtVal > 0 ? Math.max(1, Math.round(1 / dtVal)) : 30;
    const endFrame = Math.max(startFrame + 1, startFrame + frameCount - 1);

    const clip: ClipSettings = {
      startFrame,
      endFrame,
      stepSize,
      fps,
      startTime: 0,
      frameDt: 1 / fps,
      dt: 1 / fps,
      totalFrames: endFrame + 1,
    };

    const originX = extractNumProp('x0', 320);
    const originY = extractNumProp('y0', 240);
    const axes: CoordinateAxes = {
      origin: { x: originX, y: originY },
      angle: 0,
      visible: true,
      locked: false,
      gridVisible: false,
    };

    const worldLength = Math.max(0.001, extractNumProp('worldlength', 1.0));
    const scalePx = Math.max(10, extractNumProp('imagescale', 240));
    const calibration: Calibration = {
      active: true,
      visible: true,
      locked: false,
      pointA: { x: 100, y: 100 },
      pointB: { x: 100 + scalePx * worldLength, y: 100 },
      realLength: worldLength,
      unit: 'm',
      scale: scalePx,
    };

    const tracks: Track[] = [];
    const extractStepsFromBlock = (block: string, trackMassKg: number): PointStep[] => {
      const steps: PointStep[] = [];
      const frameBlockRegex =
        /<property name="\[(\d+)\]"[^>]*>[\s\S]*?<property name="x"[^>]*>\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*<\/property>[\s\S]*?<property name="y"[^>]*>\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*<\/property>/gi;
      let fbMatch: RegExpExecArray | null;
      while ((fbMatch = frameBlockRegex.exec(block)) !== null) {
        const frameNum = Number(fbMatch[1]);
        const px = Number(fbMatch[2]);
        const py = Number(fbMatch[3]);
        if (Number.isFinite(frameNum) && Number.isFinite(px) && Number.isFinite(py)) {
          const world = pixelToWorld(px, py, axes, calibration);
          const time = (frameNum - clip.startFrame) * (1 / clip.fps);
          steps.push({
            frame: frameNum,
            time,
            px,
            py,
            cam1: { px, py },
            cam1Px: px,
            cam1Py: py,
            cam1Time: time,
            x: world.x,
            y: world.y,
          });
        }
      }
      return computeKinematics(steps, trackMassKg);
    };

    const pmChunks = xmlText.split(/<object class="[^"]*PointMass"[^>]*>/i);
    for (let i = 1; i < pmChunks.length; i++) {
      const block = pmChunks[i];
      const nameMatch = block.match(/<property name="name"[^>]*>\s*([^<]+)\s*<\/property>/i);
      const massMatch = block.match(
        /<property name="mass"[^>]*>\s*([+-]?\d+(?:\.\d+)?)\s*<\/property>/i
      );
      const trackMass =
        massMatch && Number.isFinite(Number(massMatch[1])) && Number(massMatch[1]) > 0
          ? Number(massMatch[1])
          : 0.1;
      const steps = extractStepsFromBlock(block, trackMass);
      const trackIndex = i;
      tracks.push({
        id: `track-${trackIndex}`,
        name: nameMatch ? nameMatch[1].trim() : `Mass ${String.fromCharCode(64 + trackIndex)}`,
        color: trackIndex === 1 ? '#3b82f6' : trackIndex === 2 ? '#ef4444' : '#10b981',
        mass: trackMass,
        footprint: 'circle',
        steps,
        visible: true,
        showVectors: true,
        showTrails: true,
        showLabels: true,
      });
    }

    if (tracks.length === 0) {
      const fallbackSteps = extractStepsFromBlock(xmlText, 0.1);
      tracks.push({
        id: 'track-1',
        name: 'Mass A',
        color: '#3b82f6',
        mass: 0.1,
        footprint: 'circle',
        steps: fallbackSteps,
        visible: true,
        showVectors: true,
        showTrails: true,
        showLabels: true,
      });
    }

    const projectData = serializeProject({
      analysisMode: '2D',
      experimentTitle: fallbackTitle,
      videoNameCam1: videoName,
      clip: { ...clip, userTrimmed: true },
      calibration,
      axes,
      tracks,
    });

    return {
      valid: true,
      data: projectData,
      warnings: ['Imported Classic Open Source Physics (OSP) XML .trk project.'],
    };
  } catch (err: any) {
    const msg = formatProjectStageError(
      'JSON/ZIP Parse',
      `Failed to parse OSP XML .trk file: ${err?.message || 'Malformed XML'}`
    );
    return { valid: false, stage: 'JSON/ZIP Parse', error: msg, errors: [msg] };
  }
}

/**
 * Validates, sanitizes, and deserializes incoming project JSON (or OSP XML string).
 * Protects open project by returning error result rather than throwing or partially overwriting state.
 */
export function validateAndParseProject(jsonStringOrObj: string | any): ParseProjectResult {
  let parsed: any;
  if (typeof jsonStringOrObj === 'string') {
    const cleaned = jsonStringOrObj.replace(/^\uFEFF/, '').trim();
    if (!cleaned) {
      const msg = formatProjectStageError('JSON/ZIP Parse', 'Project file is empty.');
      return { valid: false, stage: 'JSON/ZIP Parse', error: msg, errors: [msg] };
    }

    if (
      cleaned.startsWith('<?xml') ||
      cleaned.startsWith('<object') ||
      cleaned.includes('org.opensourcephysics.cabrillo.tracker')
    ) {
      return parseClassicOspTrackerXml(cleaned);
    }

    try {
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      const msg = formatProjectStageError(
        'JSON/ZIP Parse',
        `JSON syntax error: ${err?.message || 'Corrupted file content'}`
      );
      return {
        valid: false,
        stage: 'JSON/ZIP Parse',
        error: msg,
        errors: [msg],
      };
    }
  } else {
    parsed = jsonStringOrObj;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const msg = formatProjectStageError(
      'Schema Validation',
      'Project data must be a valid JSON object.'
    );
    return { valid: false, stage: 'Schema Validation', error: msg, errors: [msg] };
  }

  // Unwrap if wrapped in `{ data: SavedProjectData }` or `{ project: SavedProjectData }`
  if (!Array.isArray(parsed.tracks)) {
    if (parsed.data && Array.isArray(parsed.data.tracks)) {
      parsed = parsed.data;
    } else if (parsed.project && Array.isArray(parsed.project.tracks)) {
      parsed = parsed.project;
    }
  }

  if (!Array.isArray(parsed.tracks)) {
    const msg = formatProjectStageError(
      'Schema Validation',
      "Missing required 'tracks' array in project data."
    );
    return { valid: false, stage: 'Schema Validation', error: msg, errors: [msg] };
  }

  for (let tIdx = 0; tIdx < parsed.tracks.length; tIdx++) {
    const trk = parsed.tracks[tIdx];
    if (!trk || typeof trk !== 'object' || !Array.isArray(trk.steps)) {
      const msg = formatProjectStageError(
        'Schema Validation',
        `Track at index ${tIdx} is malformed or missing steps array.`
      );
      return {
        valid: false,
        stage: 'Schema Validation',
        error: msg,
        errors: [msg],
      };
    }
  }

  const rawClipCheck = parsed.camera1?.clip || parsed.clip;
  if (rawClipCheck && rawClipCheck.fps !== undefined) {
    const fpsNum = Number(rawClipCheck.fps);
    if (!Number.isFinite(fpsNum) || fpsNum <= 0) {
      const msg = formatProjectStageError(
        'Schema Validation',
        `Invalid clip.fps value (${String(rawClipCheck.fps)}); must be a finite number > 0.`
      );
      return { valid: false, stage: 'Schema Validation', error: msg, errors: [msg] };
    }
  }

  // Run recursive sanitizer to eliminate any null / NaN / Infinity values
  parsed = sanitizeProjectPayload(parsed);

  const warnings: string[] = [];

  const is6DOF = parsed.analysisMode === '6DOF' || parsed.analysisMode === '6dof';
  const is3D =
    !is6DOF &&
    (parsed.analysisMode === '3D' ||
      parsed.analysisMode === '3d_stereo' ||
      Boolean(parsed.triangulation && parsed.analysisMode !== '2D'));

  const rawCam1Clip: ClipSettings = parsed.camera1?.clip ||
    parsed.clip || {
      startFrame: 0,
      endFrame: 100,
      stepSize: 1,
      fps: 30,
      startTime: 0,
      frameDt: 1 / 30,
      dt: 1 / 30,
      totalFrames: 100,
    };

  const camera1Clip: ClipSettings = {
    ...rawCam1Clip,
    userTrimmed: true,
  };

  const camera1Cal: Calibration = normalizeCalibrationForPersistence(
    parsed.camera1?.calibration || parsed.calibration
  );

  const camera1Origin =
    parsed.camera1?.origin || parsed.triangulation?.originCam1 || { x: 320, y: 240 };

  const rawCam2Clip: ClipSettings | undefined =
    parsed.triangulation?.clipCam2 ||
    parsed.camera2?.clip ||
    (is3D
      ? {
          ...camera1Clip,
          fps: parsed.triangulation?.fpsCam2 || camera1Clip.fps,
        }
      : undefined);

  const camera2Clip: ClipSettings | undefined = rawCam2Clip
    ? {
        ...rawCam2Clip,
        userTrimmed: true,
      }
    : undefined;

  const camera2Cal: Calibration | undefined =
    parsed.camera2?.calibration || parsed.triangulation?.calibrationCam2
      ? normalizeCalibrationForPersistence(
          parsed.camera2?.calibration || parsed.triangulation?.calibrationCam2,
          camera1Cal
        )
      : is3D
      ? normalizeCalibrationForPersistence(
          {
            ...camera1Cal,
            scale: parsed.triangulation?.pixelsPerMeterCam2 || camera1Cal.scale,
          },
          camera1Cal
        )
      : undefined;

  const camera2Origin =
    parsed.camera2?.origin || parsed.triangulation?.originCam2 || { x: 320, y: 240 };

  const rawSync = parsed.synchronization || parsed.triangulation?.syncConfig;
  const synchronization: StereoSyncConfig | undefined =
    rawSync || is3D
      ? normalizeStereoSyncConfig(
          rawSync || {
            anchorFrameCam1: parsed.clip?.startFrame || 0,
            anchorFrameCam2: camera2Clip?.startFrame || parsed.clip?.startFrame || 0,
            playbackMaster: 'both',
          },
          parsed.triangulation?.fpsCam1 || camera1Clip.fps,
          parsed.triangulation?.fpsCam2 || camera2Clip?.fps || camera1Clip.fps
        )
      : undefined;

  const restoredTriangulation: TriangulationConfig | undefined = parsed.triangulation
    ? {
        ...parsed.triangulation,
        fpsCam1: parsed.triangulation.fpsCam1 || camera1Clip.fps,
        fpsCam2: parsed.triangulation.fpsCam2 || camera2Clip?.fps || camera1Clip.fps,
        clipCam2: camera2Clip ? { ...camera2Clip } : parsed.triangulation.clipCam2,
        syncConfig: synchronization,
      }
    : undefined;

  const axes: CoordinateAxes = parsed.axes || {
    origin: { x: 320, y: 240 },
    angle: 0,
    visible: true,
    locked: false,
    gridVisible: false,
  };

  // Compute kinematics ONLY if steps lack velocity (vx/vy), passing true physical mass in kg (NEVER dt!)
  const dt = 1 / Math.max(1, camera1Clip.fps || 30);
  const normalizedTracks: Track[] = parsed.tracks.map((trk: Track) => {
    const rawSteps = trk.steps || [];
    const trackMass =
      Number.isFinite(Number(trk.mass)) && Number(trk.mass) > 0 ? Number(trk.mass) : 1.0;
    const needsKinematics =
      rawSteps.length >= 2 && rawSteps.every((s) => s.vx === undefined && s.v === undefined);
    const computedSteps = needsKinematics
      ? is3D
        ? computeKinematics3D(rawSteps, trackMass)
        : computeKinematics(rawSteps, trackMass)
      : rawSteps;

    const cleanSteps = computedSteps.map((s) =>
      sanitizePointStep(s, dt, camera1Clip.startFrame || 0, axes, camera1Cal)
    );

    return {
      ...trk,
      mass: trackMass,
      steps: cleanSteps,
    };
  });

  if (!parsed.camera1?.videoUrl && !parsed.videoUrl && !parsed.camera1?.videoName) {
    warnings.push('Camera 1 source video is not embedded. User may relink local video file.');
  }

  const resolvedVideoNameCam1 =
    parsed.camera1?.videoName ||
    parsed.videoNameCam1 ||
    parsed.videoMetadata?.fileName ||
    parsed.experimentTitle;

  const resolvedVideoNameCam2 =
    parsed.camera2?.videoName ||
    parsed.videoNameCam2 ||
    parsed.videoMetadataCam2?.fileName ||
    parsed.camera2?.videoMetadata?.fileName;

  const videoMetadata: VideoTelemetryMetadata = parsed.videoMetadata ||
    parsed.camera1?.videoMetadata || {
      fileName: resolvedVideoNameCam1 || 'experiment_video.mp4',
      width: 640,
      height: 480,
      sensorFps: camera1Clip.fps || 30,
      totalFrames:
        camera1Clip.totalFrames ||
        Math.max(1, (camera1Clip.endFrame || 100) - (camera1Clip.startFrame || 0) + 1),
    };

  const videoMetadataCam2: VideoTelemetryMetadata | undefined =
    parsed.videoMetadataCam2 ||
    parsed.camera2?.videoMetadata ||
    (is3D && resolvedVideoNameCam2
      ? {
          fileName: resolvedVideoNameCam2,
          width: 640,
          height: 480,
          sensorFps: camera2Clip?.fps || restoredTriangulation?.fpsCam2 || camera1Clip.fps || 30,
          totalFrames:
            camera2Clip?.totalFrames ||
            Math.max(1, (camera2Clip?.endFrame ?? 100) - (camera2Clip?.startFrame ?? 0) + 1),
        }
      : undefined);

  const resolvedActiveTrackId =
    parsed.activeTrackId && normalizedTracks.some((t) => t.id === parsed.activeTrackId)
      ? parsed.activeTrackId
      : normalizedTracks[0]?.id || 'track-1';

  const restoredGraphConfig = parsed.graphConfig
    ? { ...parsed.graphConfig }
    : undefined;

  const normalizedProject: SavedProjectData = {
    version: parsed.version || CURRENT_PROJECT_VERSION,
    analysisMode: is6DOF ? '6DOF' : is3D ? '3D' : '2D',
    timestamp: parsed.timestamp || new Date().toISOString(),
    experimentTitle: parsed.experimentTitle || 'Imported Tracking Project',
    currentExpId: parsed.currentExpId,
    activeTrackId: resolvedActiveTrackId,
    currentFrame: Number.isFinite(Number(parsed.currentFrame))
      ? Number(parsed.currentFrame)
      : camera1Clip.startFrame || 0,
    isSynthetic: parsed.isSynthetic,
    syntheticType: parsed.syntheticType,
    videoMetadata,
    videoMetadataCam2,
    sixDofState: parsed.sixDofState,
    camera1: {
      videoName: resolvedVideoNameCam1,
      videoUrl: parsed.camera1?.videoUrl || parsed.videoUrl,
      clip: camera1Clip,
      calibration: camera1Cal,
      origin: camera1Origin,
      videoMetadata,
    },
    camera2:
      is3D && camera2Cal && camera2Clip
        ? {
            videoName: resolvedVideoNameCam2,
            videoUrl: parsed.camera2?.videoUrl || parsed.videoUrlCam2,
            clip: camera2Clip,
            calibration: camera2Cal,
            origin: camera2Origin,
            videoMetadata: videoMetadataCam2,
          }
        : undefined,
    synchronization,
    triangulation: restoredTriangulation,
    calibration: camera1Cal,
    clip: camera1Clip,
    axes,
    tracks: normalizedTracks,
    graphConfig: restoredGraphConfig,
  };

  return {
    valid: true,
    data: normalizedProject,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Extracts a `.zip` or `.trz` bundle using JSZip, finding any internal `.trk` or `.json`
 * project file AND matching bundled media files to `cam1` / `cam2` strictly by normalized
 * relative path first, then basename, then positional fallback, with extension-inferred MIME types.
 */
export async function loadZipOrTrzBundle(file: File): Promise<ParseProjectResult> {
  const fileName = file.name || 'bundle.zip';
  const zip = new JSZip();
  let loadedZip: JSZip;
  try {
    loadedZip = await zip.loadAsync(file);
  } catch (err: any) {
    const msg = formatProjectStageError(
      'JSON/ZIP Parse',
      `Failed to decompress ZIP/TRZ archive "${fileName}": ${err?.message || 'Corrupted ZIP header'}`
    );
    return { valid: false, stage: 'JSON/ZIP Parse', error: msg, errors: [msg] };
  }

  let trkEntry: JSZip.JSZipObject | null = null;
  const videoEntries: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
  const imageEntries: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
  const videoExts = [
    '.mp4',
    '.mov',
    '.qt',
    '.avi',
    '.wmv',
    '.asf',
    '.flv',
    '.f4v',
    '.ogg',
    '.ogv',
    '.webm',
    '.m4v',
    '.mkv',
    '.mpg',
    '.mpeg',
    '.gif',
  ];
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

  loadedZip.forEach((relPath, entry) => {
    if (entry.dir) return;
    if (/(^|\/)__MACOSX(\/|$)/i.test(relPath)) return;
    const base = relPath.split('/').pop() || '';
    if (base.startsWith('.')) return;
    const low = relPath.toLowerCase();
    if (low.endsWith('project.trk')) {
      trkEntry = entry;
    } else if (!trkEntry && (low.endsWith('.trk') || low.endsWith('.json'))) {
      trkEntry = entry;
    } else if (videoExts.some((ext) => low.endsWith(ext))) {
      videoEntries.push({ path: relPath, entry });
    } else if (imageExts.some((ext) => low.endsWith(ext))) {
      imageEntries.push({ path: relPath, entry });
    }
  });

  const normalizeZipPath = (p: string): string =>
    p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '').toLowerCase();
  const baseZipName = (p: string): string => normalizeZipPath(p).split('/').pop() || '';

  const materializeZipEntry = async (item: {
    path: string;
    entry: JSZip.JSZipObject;
  }): Promise<File> => {
    const blob = await item.entry.async('blob');
    const outName = item.path.replace(/\\/g, '/').split('/').pop() || 'media.bin';
    const inferredMime = inferMediaMimeTypeFromFilename(outName);
    const finalMime =
      inferredMime !== 'application/octet-stream'
        ? inferredMime
        : blob.type || 'application/octet-stream';
    return new File([blob], outName, { type: finalMime });
  };

  if (trkEntry) {
    let trkText: string;
    try {
      trkText = await (trkEntry as JSZip.JSZipObject).async('string');
    } catch (err: any) {
      const msg = formatProjectStageError(
        'File Read',
        `Could not read project descriptor inside "${fileName}": ${err?.message || 'Read failure'}`
      );
      return { valid: false, stage: 'File Read', error: msg, errors: [msg] };
    }

    const res = validateAndParseProject(trkText);
    if (!res.valid || !res.data) {
      return res;
    }

    const allMediaPool = [...videoEntries, ...imageEntries];
    const usedPaths = new Set<string>();

    const findMatchingEntry = (expectedName?: string): { path: string; entry: JSZip.JSZipObject } | undefined => {
      if (!expectedName || !expectedName.trim()) return undefined;
      const normExpected = normalizeZipPath(expectedName);
      const baseExpected = baseZipName(expectedName);

      // 1. Exact normalized relative ZIP path match first (protects cam1/VID.avi vs cam2/VID.avi)
      const exactPathMatch = allMediaPool.find(
        (item) => !usedPaths.has(item.path) && normalizeZipPath(item.path) === normExpected
      );
      if (exactPathMatch) return exactPathMatch;

      // 2. Case-insensitive basename match
      const exactBaseMatch = allMediaPool.find(
        (item) => !usedPaths.has(item.path) && baseZipName(item.path) === baseExpected
      );
      if (exactBaseMatch) return exactBaseMatch;

      return undefined;
    };

    const expectedCam1Name = res.data.camera1?.videoName || res.data.videoMetadata?.fileName;
    const expectedCam2Name = res.data.camera2?.videoName || res.data.videoMetadataCam2?.fileName;

    let matchedCam1 = findMatchingEntry(expectedCam1Name);
    if (matchedCam1) usedPaths.add(matchedCam1.path);

    let matchedCam2 = findMatchingEntry(expectedCam2Name);
    if (matchedCam2) usedPaths.add(matchedCam2.path);

    // 3. Positional fallback ONLY when expected names did not match (prefers video entries)
    if (!matchedCam1) {
      matchedCam1 = videoEntries.find((item) => !usedPaths.has(item.path));
      if (matchedCam1) usedPaths.add(matchedCam1.path);
    }
    if (!matchedCam2 && (res.data.analysisMode === '3D' || videoEntries.length > 1)) {
      matchedCam2 = videoEntries.find((item) => !usedPaths.has(item.path));
      if (matchedCam2) usedPaths.add(matchedCam2.path);
    }

    const videoFileCam1 = matchedCam1 ? await materializeZipEntry(matchedCam1) : undefined;
    const videoFileCam2 = matchedCam2 ? await materializeZipEntry(matchedCam2) : undefined;

    return {
      ...res,
      videoFileCam1,
      videoFileCam2,
    };
  }

  // No .trk/.json descriptor: if bundle contains standalone video(s), open as video workspace
  if (videoEntries.length > 0) {
    const videoFileCam1 = await materializeZipEntry(videoEntries[0]);
    const videoFileCam2 =
      videoEntries.length > 1 ? await materializeZipEntry(videoEntries[1]) : undefined;

    const defaultData = serializeProject({
      analysisMode: videoFileCam2 ? '3D' : '2D',
      experimentTitle: fileName.replace(/\.[^/.]+$/, ''),
      videoNameCam1: videoFileCam1.name,
      videoNameCam2: videoFileCam2?.name,
      videoFileCam1,
      videoFileCam2,
      axes: {
        origin: { x: 320, y: 240 },
        angle: 0,
        visible: true,
        locked: false,
        gridVisible: false,
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Mass A',
          color: '#3b82f6',
          mass: 0.1,
          footprint: 'circle',
          steps: [],
          visible: true,
          showVectors: true,
          showTrails: true,
          showLabels: true,
        },
      ],
    });
    return {
      valid: true,
      data: defaultData,
      videoFileCam1,
      videoFileCam2,
    };
  }

  // Phase 1 preservation: if ZIP contains no .trk/.json and no video, check for a numbered image sequence
  const lazyImageEntries = await filterAndSortZipImageEntries(loadedZip);
  if (lazyImageEntries.length > 0) {
    return {
      valid: true,
      zipImageEntries: lazyImageEntries,
      archiveFileName: fileName,
    };
  }

  const msg = formatProjectStageError(
    'JSON/ZIP Parse',
    `Archive "${fileName}" does not contain a valid project.trk, video file, or image sequence.`
  );
  return {
    valid: false,
    stage: 'JSON/ZIP Parse',
    error: msg,
    errors: [msg],
  };
}

/**
 * Helper to read text from a File in both browser and Node/Vitest environments.
 */
async function readFileAsUtf8Text(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return await file.text();
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => reject(new Error('Failed to read file text'));
    reader.readAsText(file);
  });
}

/**
 * Universal Magic-Byte File Router (`ingestWorkstationFile`):
 * Inspects the first 16 bytes (`file.slice(0, 16)`) AND filename extension so `.trk`, `.json`,
 * `.zip`, and `.trz` files are NEVER routed to the video codec decoder, and binary `.zip` files
 * are NEVER passed to `JSON.parse()`.
 */
export async function ingestWorkstationFile(file: File): Promise<IngestedWorkstationFileResult> {
  const fileName = file.name || '';
  const lowerName = fileName.toLowerCase();

  let magicBytes = new Uint8Array(0);
  try {
    const buf = await file.slice(0, 16).arrayBuffer();
    magicBytes = new Uint8Array(buf);
  } catch (err: any) {
    if (lowerName.endsWith('.trk') || lowerName.endsWith('.json') || lowerName.endsWith('.zip') || lowerName.endsWith('.trz')) {
      const msg = formatProjectStageError(
        'File Read',
        `Unable to read leading bytes of "${fileName}": ${err?.message || 'File read error'}`
      );
      const failRes: ParseProjectResult = { valid: false, stage: 'File Read', error: msg, errors: [msg] };
      return {
        ...failRes,
        kind: 'project',
        route: 'json-trk',
        projectResult: failRes,
      };
    }
  }

  // 1. Check ZIP magic header (`50 4B 03 04` = `PK\x03\x04`) or `.zip` / `.trz` extension
  const isZipMagic =
    magicBytes.length >= 4 &&
    magicBytes[0] === 0x50 &&
    magicBytes[1] === 0x4b &&
    magicBytes[2] === 0x03 &&
    magicBytes[3] === 0x04;

  if (isZipMagic || lowerName.endsWith('.zip') || lowerName.endsWith('.trz')) {
    try {
      const projectResult = await loadZipOrTrzBundle(file);
      if (
        projectResult.valid &&
        projectResult.zipImageEntries &&
        projectResult.zipImageEntries.length > 0 &&
        !projectResult.data
      ) {
        return {
          ...projectResult,
          kind: 'image-sequence',
          route: 'zip-image-sequence',
          zipImageEntries: projectResult.zipImageEntries,
          archiveFileName: projectResult.archiveFileName || fileName,
        };
      }
      return {
        ...projectResult,
        kind: 'project',
        route: 'zip-bundle',
        projectResult,
      };
    } catch (err: any) {
      if (isZipMagic || lowerName.endsWith('.zip') || lowerName.endsWith('.trz')) {
        const msg = formatProjectStageError(
          'JSON/ZIP Parse',
          `Could not read ZIP/TRZ archive "${fileName}": ${err?.message || 'Corrupted archive'}`
        );
        const failRes: ParseProjectResult = {
          valid: false,
          stage: 'JSON/ZIP Parse',
          error: msg,
          errors: [msg],
        };
        return {
          ...failRes,
          kind: 'project',
          route: 'zip-bundle',
          projectResult: failRes,
        };
      }
    }
  }

  // Decode leading ASCII/UTF-8 characters from magicBytes (stripping UTF-8 BOM EF BB BF)
  let leadingText = '';
  if (magicBytes.length > 0) {
    const startIdx =
      magicBytes.length >= 3 &&
      magicBytes[0] === 0xef &&
      magicBytes[1] === 0xbb &&
      magicBytes[2] === 0xbf
        ? 3
        : 0;
    for (let i = startIdx; i < magicBytes.length; i++) {
      leadingText += String.fromCharCode(magicBytes[i]);
    }
    leadingText = leadingText.trimStart();
  }

  // 2. Check XML magic prefix (`<?xml` or `<object`)
  if (leadingText.startsWith('<?xml') || leadingText.startsWith('<object')) {
    try {
      const text = await readFileAsUtf8Text(file);
      const projectResult = parseClassicOspTrackerXml(
        text.replace(/^\uFEFF/, '').trim(),
        fileName.replace(/\.[^/.]+$/, '') || 'OSP Tracker Import'
      );
      return {
        ...projectResult,
        kind: 'project',
        route: 'osp-xml-trk',
        projectResult,
      };
    } catch (err: any) {
      const msg = formatProjectStageError(
        'File Read',
        `Could not read XML .trk file "${fileName}": ${err?.message || 'Read error'}`
      );
      const failRes: ParseProjectResult = { valid: false, stage: 'File Read', error: msg, errors: [msg] };
      return {
        ...failRes,
        kind: 'project',
        route: 'osp-xml-trk',
        projectResult: failRes,
      };
    }
  }

  // 3. Check JSON magic prefix (`{`) or `.trk` / `.json` extension
  if (
    leadingText.startsWith('{') ||
    lowerName.endsWith('.trk') ||
    lowerName.endsWith('.json')
  ) {
    let rawText: string;
    try {
      rawText = await readFileAsUtf8Text(file);
    } catch (err: any) {
      const msg = formatProjectStageError(
        'File Read',
        `Could not read project file "${fileName}": ${err?.message || 'Read error'}`
      );
      const failRes: ParseProjectResult = { valid: false, stage: 'File Read', error: msg, errors: [msg] };
      return {
        ...failRes,
        kind: 'project',
        route: 'json-trk',
        projectResult: failRes,
      };
    }

    const cleaned = rawText.replace(/^\uFEFF/, '').trim();
    if (cleaned.startsWith('<?xml') || cleaned.startsWith('<object')) {
      const xmlResult = parseClassicOspTrackerXml(
        cleaned,
        fileName.replace(/\.[^/.]+$/, '') || 'OSP Tracker Import'
      );
      return {
        ...xmlResult,
        kind: 'project',
        route: 'osp-xml-trk',
        projectResult: xmlResult,
      };
    }

    const projectResult = validateAndParseProject(cleaned);
    if (
      projectResult.valid &&
      projectResult.data &&
      (!projectResult.data.experimentTitle ||
        projectResult.data.experimentTitle === 'Imported Tracking Project')
    ) {
      projectResult.data.experimentTitle =
        fileName.replace(/\.[^/.]+$/, '') || 'Imported Tracking Project';
    }
    return {
      ...projectResult,
      kind: 'project',
      route: 'json-trk',
      projectResult,
    };
  }

  // 4. Otherwise, route to the 3-Tier Universal Video Engine
  return {
    kind: 'video',
    route: 'video-decoder',
    videoFile: file,
  };
}

/**
 * Universal asynchronous project file reader (wraps `ingestWorkstationFile`).
 */
export async function parseProjectFile(file: File): Promise<ParseProjectResult> {
  const ingested = await ingestWorkstationFile(file);
  if (ingested.kind === 'project' && ingested.projectResult) {
    return ingested.projectResult;
  }
  const msg = formatProjectStageError(
    'Magic-Byte Router',
    `File "${file.name}" was classified as "${ingested.kind}" instead of a .trk or .zip project file.`
  );
  return {
    valid: false,
    stage: 'Magic-Byte Router',
    error: msg,
    errors: [msg],
  };
}

/**
 * Checks whether an uploaded file is a `.trk` / `.json` project file or a `.zip` / `.trz` project bundle.
 */
export async function isProjectFileOrBundle(file: File): Promise<boolean> {
  const ingested = await ingestWorkstationFile(file);
  return ingested.kind === 'project';
}

/**
 * Hydration Lock & Synchronous LocalStorage Session Save & Restore
 * Prevents initial mount from overwriting saved user work before hydration completes.
 */
const memorySessionStore = new Map<string, string>();

export interface HydrationController {
  isHydrated: () => boolean;
  markHydrated: () => void;
  tryAutoSave: (project: SavedProjectData) => boolean;
  saveSessionIfHydrated: (project: SavedProjectData) => boolean;
}

export function createHydrationController(initiallyHydrated = false): HydrationController {
  let hydrated = initiallyHydrated;
  const doSave = (project: SavedProjectData) => {
    if (!hydrated) return false;
    return saveSessionToLocalStorage(project, true);
  };
  return {
    isHydrated: () => hydrated,
    markHydrated: () => {
      hydrated = true;
    },
    tryAutoSave: doSave,
    saveSessionIfHydrated: doSave,
  };
}

export function saveSessionToLocalStorage(
  project: SavedProjectData,
  isHydrated = true
): boolean {
  if (!isHydrated) {
    return false;
  }
  const serialized = serializeProjectToTrk(project);
  memorySessionStore.set(AUTOSAVE_STORAGE_KEY_V2, serialized);
  memorySessionStore.set(AUTOSAVE_STORAGE_KEY, serialized);
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(AUTOSAVE_STORAGE_KEY_V2, serialized);
      localStorage.setItem(AUTOSAVE_STORAGE_KEY, serialized);
    }
    return true;
  } catch {
    return true;
  }
}

export function loadSynchronousSessionSnapshot(): SavedProjectData | null {
  try {
    let raw: string | null = null;
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      raw =
        localStorage.getItem(AUTOSAVE_STORAGE_KEY_V2) ||
        localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    }
    if (!raw) {
      raw =
        memorySessionStore.get(AUTOSAVE_STORAGE_KEY_V2) ||
        memorySessionStore.get(AUTOSAVE_STORAGE_KEY) ||
        null;
    }
    if (!raw) return null;
    const parsed = validateAndParseProject(raw);
    if (parsed.valid && parsed.data) {
      return parsed.data;
    }
  } catch {
    // ignore
  }
  return null;
}

export const loadSessionFromLocalStorage = loadSynchronousSessionSnapshot;

/**
 * IndexedDB Persistence Layer for Full Project State & LRU Video Cache (`video_cache_${fileName}_${fileSize}`)
 */
function openWorkspaceIndexedDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_PROJECT)) {
          db.createObjectStore(IDB_STORE_PROJECT);
        }
        if (!db.objectStoreNames.contains(IDB_STORE_MEDIA)) {
          db.createObjectStore(IDB_STORE_MEDIA);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveWorkspaceToIndexedDB(
  project: SavedProjectData,
  isHydrated = true
): Promise<boolean> {
  if (!isHydrated) return false;
  const db = await openWorkspaceIndexedDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_PROJECT, 'readwrite');
      const store = tx.objectStore(IDB_STORE_PROJECT);
      store.put(sanitizeProjectPayload(project), 'latest_session');
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function loadWorkspaceFromIndexedDB(): Promise<SavedProjectData | null> {
  const db = await openWorkspaceIndexedDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_PROJECT, 'readonly');
      const store = tx.objectStore(IDB_STORE_PROJECT);
      const getReq = store.get('latest_session');
      getReq.onsuccess = () => {
        db.close();
        const res = getReq.result;
        if (res && typeof res === 'object') {
          const validated = validateAndParseProject(res);
          resolve(validated.valid && validated.data ? validated.data : null);
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/**
 * Stores uploaded video in IndexedDB keyed by:
 * - `slot` ('cam1' | 'cam2')
 * - `last_active_video_${slot}`
 * - `video_cache_${fileName}_${fileSize}` (retaining up to the 3 most recent videos)
 */
export async function saveWorkspaceMediaToIndexedDB(
  slot: 'cam1' | 'cam2',
  file: File,
  expId?: string
): Promise<boolean> {
  const db = await openWorkspaceIndexedDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MEDIA);
      const record = {
        file,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        expId,
        updatedAt: Date.now(),
      };

      store.put(record, slot);
      store.put(record, `last_active_video_${slot}`);
      const cacheKey = `video_cache_${file.name}_${file.size}`;
      store.put(record, cacheKey);

      // Maintain LRU index of last 3 video_cache_* keys
      const idxReq = store.get('video_cache_lru_keys');
      idxReq.onsuccess = () => {
        const existingKeys: string[] = Array.isArray(idxReq.result) ? idxReq.result : [];
        const updatedKeys = [
          cacheKey,
          ...existingKeys.filter((k) => k !== cacheKey),
        ];
        while (updatedKeys.length > 3) {
          const evicted = updatedKeys.pop();
          if (evicted) {
            store.delete(evicted);
          }
        }
        store.put(updatedKeys, 'video_cache_lru_keys');
      };

      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function loadWorkspaceMediaFromIndexedDB(
  slotOrKey: 'cam1' | 'cam2' | string
): Promise<{ file: File; fileName: string; fileSize?: number; expId?: string } | null> {
  const db = await openWorkspaceIndexedDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_MEDIA, 'readonly');
      const store = tx.objectStore(IDB_STORE_MEDIA);
      const getReq = store.get(slotOrKey);
      getReq.onsuccess = () => {
        db.close();
        const rec = getReq.result;
        if (rec && rec.file) {
          const restoredFile =
            rec.file instanceof File
              ? rec.file
              : new File([rec.file], rec.fileName || `video.mp4`, {
                  type: rec.mimeType || 'video/mp4',
                });
          resolve({
            file: restoredFile,
            fileName: restoredFile.name,
            fileSize: rec.fileSize ?? restoredFile.size,
            expId: rec.expId,
          });
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/**
 * Looks up a cached video in IndexedDB when reopening a standalone `.trk` file:
 * 1. Exact `video_cache_${fileName}_${fileSize}` match
 * 2. Filename match in `last_active_video_${slot}` or `slot`
 */
export async function findCachedVideoForProject(
  videoMetadata?: VideoTelemetryMetadata,
  videoName?: string,
  slot: 'cam1' | 'cam2' = 'cam1'
): Promise<File | null> {
  const targetName = videoMetadata?.fileName || videoName;
  const targetSize = videoMetadata?.fileSize;

  if (targetName && targetSize !== undefined) {
    const exactMatch = await loadWorkspaceMediaFromIndexedDB(
      `video_cache_${targetName}_${targetSize}`
    );
    if (exactMatch?.file) {
      return exactMatch.file;
    }
  }

  const lastActive =
    (await loadWorkspaceMediaFromIndexedDB(`last_active_video_${slot}`)) ||
    (await loadWorkspaceMediaFromIndexedDB(slot));

  if (lastActive?.file) {
    if (!targetName || lastActive.fileName === targetName) {
      return lastActive.file;
    }
  }

  return null;
}

export async function clearSavedWorkspaceSession(): Promise<void> {
  memorySessionStore.delete(AUTOSAVE_STORAGE_KEY_V2);
  memorySessionStore.delete(AUTOSAVE_STORAGE_KEY);
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(AUTOSAVE_STORAGE_KEY_V2);
      localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  const db = await openWorkspaceIndexedDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([IDB_STORE_PROJECT, IDB_STORE_MEDIA], 'readwrite');
      tx.objectStore(IDB_STORE_PROJECT).clear();
      tx.objectStore(IDB_STORE_MEDIA).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
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
        'Frame',
        'Time_s',
        'x_m',
        'y_m',
        'z_m',
        'u1_px',
        'v1_px',
        'u2_px',
        'v2_px',
        'reprojection_residual_px',
        'vx_mps',
        'vy_mps',
        'vz_mps',
        'speed_mps',
        'ax_mps2',
        'ay_mps2',
        'az_mps2',
        'accel_mag_mps2',
      ]
    : [
        'Frame',
        'Time_s',
        'x_m',
        'y_m',
        'u_px',
        'v_px',
        'vx_mps',
        'vy_mps',
        'speed_mps',
        'ax_mps2',
        'ay_mps2',
        'accel_mag_mps2',
      ];

  const rows = activeTrack.steps.map((rawStep) => {
    const s = sanitizePointStep(rawStep);
    const base = [
      s.frame,
      s.time.toFixed(5),
      s.x.toFixed(5),
      s.y.toFixed(5),
    ];
    if (hasZ) {
      base.push((s.z ?? 0).toFixed(5));
      base.push(
        s.cam1?.px != null ? s.cam1.px.toString() : s.cam1Px != null ? s.cam1Px.toString() : '',
        s.cam1?.py != null ? s.cam1.py.toString() : s.cam1Py != null ? s.cam1Py.toString() : '',
        s.cam2?.px != null ? s.cam2.px.toString() : s.cam2Px != null ? s.cam2Px.toString() : '',
        s.cam2?.py != null ? s.cam2.py.toString() : s.cam2Py != null ? s.cam2Py.toString() : '',
        s.triangulationResidual != null
          ? s.triangulationResidual.toFixed(3)
          : s.residual != null
          ? s.residual.toFixed(3)
          : ''
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
 * Streams a File directly into a FileSystemDirectoryHandle without loading multi-GB files into RAM.
 */
async function streamFileToDirectoryHandle(
  dirHandle: any,
  fileName: string,
  file: File
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  if (typeof file.stream === 'function' && typeof writable?.getWriter === 'function') {
    await file.stream().pipeTo(writable);
  } else {
    await writable.write(file);
    await writable.close();
  }
}

/**
 * Saves project to a directory folder using File System Access API where available (streaming full-size
 * Cam 1 / Cam 2 media directly to disk with zero RAM spike and collision-safe naming),
 * or packages into a self-contained ZIP bundle archive (with explicit >150 MB omission notice).
 */
export async function saveProjectToFolderOrBundle(
  projectOrOptions: SavedProjectData | SerializeProjectOptions
): Promise<SaveProjectResult> {
  const isRawOptions = !('version' in projectOrOptions && 'timestamp' in projectOrOptions);
  const projectData: SavedProjectData = isRawOptions
    ? serializeProject(projectOrOptions as SerializeProjectOptions)
    : sanitizeProjectPayload(projectOrOptions as SavedProjectData);

  const videoFileCam1 = isRawOptions
    ? (projectOrOptions as SerializeProjectOptions).videoFileCam1
    : undefined;
  const videoFileCam2 = isRawOptions
    ? (projectOrOptions as SerializeProjectOptions).videoFileCam2
    : undefined;

  // Collision-safe dual-camera filenames (e.g. two cameras both named VID_0001.avi -> cam1_VID_0001.avi & cam2_VID_0001.avi)
  const { nameCam1, nameCam2 } = resolveDualExportFilenames(
    videoFileCam1?.name,
    videoFileCam2?.name
  );

  if (videoFileCam1 && nameCam1) {
    projectData.camera1 = {
      ...projectData.camera1,
      videoName: nameCam1,
      videoMetadata: projectData.camera1.videoMetadata
        ? { ...projectData.camera1.videoMetadata, fileName: nameCam1 }
        : projectData.videoMetadata
        ? { ...projectData.videoMetadata, fileName: nameCam1 }
        : undefined,
    };
    if (projectData.videoMetadata) {
      projectData.videoMetadata = { ...projectData.videoMetadata, fileName: nameCam1 };
    }
  }

  if (videoFileCam2 && nameCam2) {
    if (projectData.camera2) {
      projectData.camera2 = {
        ...projectData.camera2,
        videoName: nameCam2,
        videoMetadata: projectData.camera2.videoMetadata
          ? { ...projectData.camera2.videoMetadata, fileName: nameCam2 }
          : projectData.videoMetadataCam2
          ? { ...projectData.videoMetadataCam2, fileName: nameCam2 }
          : undefined,
      };
    }
    if (projectData.videoMetadataCam2) {
      projectData.videoMetadataCam2 = { ...projectData.videoMetadataCam2, fileName: nameCam2 };
    }
  }

  // Pre-export self-validation gate: never write an unloadable project.trk
  const validated = serializeAndValidateTrk(projectData);
  if (!validated.valid) {
    throw new Error(validated.error);
  }
  const projectJson = validated.trkString;

  const safeName = (projectData.experimentTitle || 'tracker_project').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const csvContent = generateKinematicsCSV(projectData.tracks);

  const buildReadme = (mediaFiles: string[], omitted: string[]): string => {
    const lines = [
      `Tracker / Open Source Physics – Defense Photogrammetry Project`,
      `================================================================`,
      `Title:        ${projectData.experimentTitle}`,
      `Date:         ${projectData.timestamp}`,
      `Version:      ${projectData.version}`,
      `Analysis:     ${projectData.analysisMode}`,
      `Tracks:       ${projectData.tracks.length} track(s)`,
      `Total Points: ${projectData.tracks.reduce((acc, t) => acc + t.steps.length, 0)} observation(s)`,
      ``,
      `Files in this Project Bundle:`,
      `- project.trk        : Complete serialized project dataset, calibration & 6-DOF configuration`,
      `- tracking_data.csv  : Exported kinematics data table`,
      `- README_PROJECT.txt : This project summary`,
      ...mediaFiles.map((mf) => `- ${mf} : Bundled source media`),
    ];
    if (omitted.length > 0) {
      lines.push(
        ``,
        `OMITTED MEDIA (>150 MB IN-MEMORY ZIP CAP):`,
        ...omitted.map((om) => `- ${om}`),
        `Recommendation: Use "Save Project to Folder" (Directory Picker) to stream multi-GB range footage directly to disk without size limits.`
      );
    }
    return lines.join('\n');
  };

  const filesWritten = ['project.trk', 'tracking_data.csv', 'README_PROJECT.txt'];

  // Attempt File System Access API if supported (streams full-size Cam 1 & Cam 2 videos directly to disk)
  if (typeof (window as any).showDirectoryPicker === 'function') {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });

      const folderMediaNames: string[] = [];
      if (videoFileCam1 && nameCam1) folderMediaNames.push(nameCam1);
      if (videoFileCam2 && nameCam2) folderMediaNames.push(nameCam2);

      const fileHandleTrk = await dirHandle.getFileHandle('project.trk', { create: true });
      const writableTrk = await fileHandleTrk.createWritable();
      await writableTrk.write(projectJson);
      await writableTrk.close();

      const fileHandleCsv = await dirHandle.getFileHandle('tracking_data.csv', { create: true });
      const writableCsv = await fileHandleCsv.createWritable();
      await writableCsv.write(csvContent);
      await writableCsv.close();

      const fileHandleReadme = await dirHandle.getFileHandle('README_PROJECT.txt', {
        create: true,
      });
      const writableReadme = await fileHandleReadme.createWritable();
      await writableReadme.write(buildReadme(folderMediaNames, []));
      await writableReadme.close();

      // Stream full-size source videos directly to disk (no 150 MB cap, zero RAM spike)
      if (videoFileCam1 && nameCam1) {
        await streamFileToDirectoryHandle(dirHandle, nameCam1, videoFileCam1);
        filesWritten.push(nameCam1);
      }
      if (videoFileCam2 && nameCam2) {
        await streamFileToDirectoryHandle(dirHandle, nameCam2, videoFileCam2);
        filesWritten.push(nameCam2);
      }

      return {
        savedAsFolder: true,
        method: 'folder',
        pathOrName: dirHandle.name || 'Selected Folder',
        filesWritten,
      };
    } catch (err: any) {
      // User cancelled directory picker: exit cleanly without falling back to a ZIP download
      if (err?.name === 'AbortError') {
        throw err;
      }
      console.warn(
        'Directory Picker encountered issue, falling back to ZIP archive bundle:',
        err
      );
    }
  }

  // Fallback: Generate self-contained ZIP bundle containing project.trk + tracking_data.csv + README_PROJECT.txt + optional video (<= 150 MB)
  const zip = new JSZip();
  zip.file('project.trk', projectJson);
  zip.file('tracking_data.csv', csvContent);

  const MAX_BUNDLE_VIDEO_BYTES = 150 * 1024 * 1024;
  const bundledMediaNames: string[] = [];
  const omittedVideos: string[] = [];

  if (videoFileCam1 && nameCam1) {
    if (videoFileCam1.size <= MAX_BUNDLE_VIDEO_BYTES) {
      zip.file(nameCam1, videoFileCam1);
      filesWritten.push(nameCam1);
      bundledMediaNames.push(nameCam1);
    } else {
      const sizeMb = (videoFileCam1.size / (1024 * 1024)).toFixed(1);
      omittedVideos.push(`${nameCam1} (${sizeMb} MB)`);
    }
  }

  if (videoFileCam2 && nameCam2) {
    if (videoFileCam2.size <= MAX_BUNDLE_VIDEO_BYTES) {
      zip.file(nameCam2, videoFileCam2);
      filesWritten.push(nameCam2);
      bundledMediaNames.push(nameCam2);
    } else {
      const sizeMb = (videoFileCam2.size / (1024 * 1024)).toFixed(1);
      omittedVideos.push(`${nameCam2} (${sizeMb} MB)`);
    }
  }

  zip.file('README_PROJECT.txt', buildReadme(bundledMediaNames, omittedVideos));

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
    omittedVideos: omittedVideos.length > 0 ? omittedVideos : undefined,
  };
}
