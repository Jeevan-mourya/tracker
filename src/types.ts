export interface PointStep {
  frame: number;
  time: number; // in seconds
  px: number; // raw pixel X in video (or Camera 1)
  py: number; // raw pixel Y in video (or Camera 1)
  x: number; // calibrated world X (meters)
  y: number; // calibrated world Y (meters)
  z?: number; // calibrated world Z (meters, for 3D analysis)
  cam1?: { px: number; py: number } | null; // Camera 1 raw pixel coordinates
  cam2?: { px: number; py: number } | null; // Camera 2 raw pixel coordinates
  cam1Px?: number; // Flat pixel X Camera 1
  cam1Py?: number; // Flat pixel Y Camera 1
  cam2Px?: number; // Flat pixel X Camera 2
  cam2Py?: number; // Flat pixel Y Camera 2
  residual?: number; // Reprojection residual in pixels / meters
  vx?: number | null; // m/s
  vy?: number | null; // m/s
  vz?: number | null; // m/s (3D)
  v?: number | null; // speed (m/s, sqrt(vx^2 + vy^2 + vz^2))
  ax?: number | null; // m/s²
  ay?: number | null; // m/s²
  az?: number | null; // m/s² (3D)
  a?: number | null; // acceleration magnitude (m/s²)
  kineticEnergy?: number | null; // Joules
  potentialEnergy?: number | null; // Joules
  totalEnergy?: number | null; // Joules
  triangulationResidual?: number | null; // meters error in triangulation
  slantRange?: number | null; // Slant range to target R = sqrt(x^2 + y^2 + z^2) in meters
  azimuthDeg?: number | null; // Azimuth angle in degrees
  elevationDeg?: number | null; // Elevation angle in degrees
  machNumber?: number | null; // Speed in Mach
  gForce?: number | null; // Total acceleration in Gs (a / 9.80665)
}

export type TrackFootprint = 'circle' | 'crosshair' | 'diamond' | 'square';

export interface Track {
  id: string;
  name: string;
  color: string;
  mass: number; // in kg
  footprint: TrackFootprint;
  steps: PointStep[];
  visible: boolean;
  showVectors: boolean;
  showTrails: boolean;
  showLabels: boolean;
}

export interface Calibration {
  active: boolean;
  pointA: { x: number; y: number }; // video pixel coordinates
  pointB: { x: number; y: number };
  realLength: number; // known length in user's unit
  unit: 'm' | 'cm' | 'mm' | 'ft';
  scale: number; // pixels per meter
  locked: boolean;
  visible: boolean;
}

export interface CoordinateAxes {
  origin: { x: number; y: number }; // video pixel coordinates of (0,0)
  angle: number; // degrees, positive counter-clockwise from horizontal
  visible: boolean;
  locked: boolean;
  gridVisible: boolean;
}

export interface ClipSettings {
  startFrame: number;
  endFrame: number;
  stepSize: number;
  fps: number; // Frame rate in frames per second
  startTime: number; // Start time in seconds (t0)
  frameDt: number; // Time step per frame step (dt = stepSize / fps)
  dt: number; // Alias for backward compatibility
  totalFrames: number;
}

export type PlotVariable =
  | 'x'
  | 'y'
  | 'z'
  | 'vx'
  | 'vy'
  | 'vz'
  | 'v'
  | 'ax'
  | 'ay'
  | 'az'
  | 'a'
  | 'kineticEnergy'
  | 'potentialEnergy'
  | 'totalEnergy';

export type FitType = 'none' | 'linear' | 'parabolic' | 'cubic';

export interface FitResult {
  type: FitType;
  equation: string;
  params: { [key: string]: number };
  rSquared: number;
  rmse?: number;
  notes?: string;
}

/**
 * 3D Direct Linear Transformation (DLT) & Stereo Triangulation Types
 */
export type TriangulationMethod =
  | 'orthogonal-front-side' // Cam 1: Front (X,Y), Cam 2: Side (Z,Y)
  | 'orthogonal-front-top' // Cam 1: Front (X,Y), Cam 2: Overhead (X,Z)
  | 'convergent-stereo' // Dual angled stereo baseline
  | 'dlt-parameters'; // Explicit 11-parameter DLT matrices

// 11 DLT coefficients [L1..L11] mapping (X,Y,Z) to (u,v)
export type DLT11 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number
];

export interface TriangulationConfig {
  method: TriangulationMethod;
  pixelsPerMeterCam1: number;
  pixelsPerMeterCam2: number;
  originCam1: { x: number; y: number };
  originCam2: { x: number; y: number };
  baselineMeters: number; // Distance between cameras in stereo setup
  convergenceAngleDeg: number; // Angle between optical axes
  dltCam1?: DLT11;
  dltCam2?: DLT11;
  calibrated: boolean;
  meanResidualMeters: number;
}

export interface CameraFeedConfig {
  id: 'cam1' | 'cam2';
  name: string;
  role: string; // e.g. 'Front View (X-Y)' or 'Side/Top View (Z-Y/X-Z)'
  videoUrl: string;
  isSynthetic: boolean;
}

export interface SampleExperiment {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  category: string;
  is3D?: boolean;
  videoUrlCam2?: string;
  calibration: Calibration;
  axes: CoordinateAxes;
  clip: ClipSettings;
  triangulation?: TriangulationConfig;
  samplePoints?: {
    frame: number;
    px: number;
    py: number;
    cam2Px?: number;
    cam2Py?: number;
    z?: number;
  }[];
}
