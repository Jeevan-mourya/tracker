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
  // 2D Image Plane Reprojection Residual: mean ray reprojection discrepancy in PIXELS (not 3D error)
  triangulationResidual?: number | null; // pixels
  // Independent Physical 3D Ground-Truth Reference (when surveyed or physically measured)
  referenceX?: number | null; // meters
  referenceY?: number | null; // meters
  referenceZ?: number | null; // meters
  // Physical 3D Reconstruction Error: ||X_reconstructed - X_reference|| (meters)
  // ONLY populated when independent ground truth is supplied; undefined/null otherwise
  reconstructionError3D?: number | null;
  slantRange?: number | null; // Slant range to target R = sqrt(x^2 + y^2 + z^2) in meters
  azimuthDeg?: number | null; // Azimuth angle in degrees
  elevationDeg?: number | null; // Elevation angle in degrees
  machNumber?: number | null; // Speed in Mach
  gForce?: number | null; // Total acceleration in Gs (a / 9.80665)
  // High-speed stereo asynchronous tracking metadata (when Cam 1 & Cam 2 frame rates differ)
  cam1Time?: number;
  cam2Time?: number;
  cam2Frame?: number;
  isInterpolatedCam1?: boolean;
  isInterpolatedCam2?: boolean;
  temporalDeltaSeconds?: number;
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
  fps: number; // Capture sensor frame rate (e.g. 1000, 10000, 100000 fps)
  startTime: number; // Start time in seconds (t0)
  frameDt: number; // Time step per frame step (dt = stepSize / fps)
  dt: number; // Alias for backward compatibility
  totalFrames: number;
  playbackFps?: number; // Container video playback rate (defaults to 30 fps)
  cameraModel?: string; // e.g. "Photron FASTCAM SA-Z", "Phantom v2512"
  timeUnit?: 'auto' | 's' | 'ms' | 'us' | 'ns'; // Unit for display
  shutterSpeed?: string; // e.g. "1/100,000 s" or "5 µs"
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
  | 'totalEnergy'
  | 'mach'
  | 'gForce'
  | 'slantRange';

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

export type TriangulationStatus =
  | 'valid'
  | 'invalid_input'
  | 'degenerate_geometry'
  | 'nearly_parallel_rays'
  | 'singular_matrix'
  | 'numerical_nonfinite';

export interface RobustTriangulationResult {
  x: number;
  y: number;
  z: number;
  residual: number; // Backward-compatible mean residual in pixels
  reprojectionErrorLeft: number;
  reprojectionErrorRight: number;
  reprojectionRms: number;
  reprojectionMax: number;
  reprojectionMedian: number;
  conditionMetric: number; // Matrix condition estimate (1.0 = ideal, > 1e6 = ill-conditioned)
  rayAngleDeg: number; // Intersection angle between optical rays in degrees
  valid: boolean;
  status: TriangulationStatus;
  statusMessage?: string;
}

export type TemporalInterpMethod = 'linear' | 'cubic-spline' | 'nearest';

export type CalibrationMode = 'idealized_demo' | 'empirical_measured';

export type CalibrationStatus =
  | 'successful'
  | 'invalid_input'
  | 'insufficient_points'
  | 'degenerate_geometry'
  | 'ill_conditioned'
  | 'rank_deficient'
  | 'non_finite_solution';

export interface LensDistortionParams {
  enabled: boolean;
  k1: number; // Radial 1st order
  k2: number; // Radial 2nd order
  k3?: number; // Radial 3rd order
  p1?: number; // Tangential 1st order
  p2?: number; // Tangential 2nd order
}

export interface CalibrationControlPoint3D {
  id: string;
  x: number; // World meters
  y: number; // World meters
  z: number; // World meters
  u: number; // Image pixel x
  v: number; // Image pixel y
  isValidation?: boolean; // If true, held out for independent cross-validation
  residualPx?: number; // Reprojection error in pixels
}

export interface EmpiricalCalibrationResult {
  schemaVersion: '1.0';
  calibrationType: 'projective-dlt-11';
  cameraId: 'cam1' | 'cam2' | string;
  dlt: DLT11;
  controlPointCount: number;
  validationPointCount: number;
  // 2D Image Plane Reprojection Residuals (Pixels)
  // Metric A: Calibration fit residual on training control points
  trainingResidualRms: number; // Pixels (RMS calibration fit residual)
  trainingResidualMax: number; // Pixels
  trainingResidualMedian: number; // Pixels
  // Metric B: Hold-out validation residual on independent control points
  validationResidualRms?: number; // Pixels (RMS hold-out validation residual)
  validationResidualMax?: number; // Pixels
  validationResidualMedian?: number; // Pixels

  // Singular-Value Metrics (DLT Homogeneous Design Matrix A, 2N x 12, rank 11):
  // Metric 1: Largest-to-smallest non-null singular-value ratio (subspace conditioning)
  kappaNonNull: number; // sigma_1 / sigma_11
  // Metric 2: Null-space separation ratio (spectral gap)
  nullSpaceSeparation: number; // gamma = sigma_11 / sigma_12
  // Metric 3: Full spectral condition number sigma_1 / sigma_12
  // (Mathematically infinite/undefined for exact noiseless rank-11 null space where sigma_12 = 0)
  fullSpectralConditionNumber: number | null;
  // Backward compatibility alias for kappaNonNull
  conditionNumber: number;
  conditionEstimate?: number; // QR-based diagonal ratio estimate: max(|R_ii|) / min(|R_ii|)
  singularValues: number[]; // Singular values sigma_1 >= ... >= sigma_12 of normalized design matrix A
  status: CalibrationStatus;
  statusMessage: string;
  valid: boolean;
  distortion: LensDistortionParams;
  distortionMethod: 'none' | 'supplied_parameters'; // Explicitly distinguish supplied correction parameters from estimated calibration
  normalization?: {
    centroid3D: { x: number; y: number; z: number };
    scale3D: number;
    centroid2D: { u: number; v: number };
    scale2D: number;
  };
  points?: CalibrationControlPoint3D[];
  timestamp: string;
  notes?: string;
}

export interface TriangulationConfig {
  method: TriangulationMethod;
  calibrationMode?: CalibrationMode; // 'idealized_demo' vs 'empirical_measured'
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

  // Empirical calibration details
  empiricalCam1?: EmpiricalCalibrationResult;
  empiricalCam2?: EmpiricalCalibrationResult;
  distortionCam1?: LensDistortionParams;
  distortionCam2?: LensDistortionParams;

  // Asynchronous / Mismatched Frame Rates & Temporal Synchronization
  fpsCam1?: number; // Capture rate Camera 1 (e.g. 10000)
  fpsCam2?: number; // Capture rate Camera 2 (e.g. 5000, 2500, 1000)
  timeOffsetCam2Sec?: number; // Time sync offset between Cam 2 and Cam 1 in seconds (t_cam2 = t_cam1 - offset)
  temporalInterpolation?: TemporalInterpMethod; // Method for sub-frame spatial interpolation
  allowAsymmetricFrameRates?: boolean;
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
  syntheticType?: string;
  samplePoints?: {
    frame: number;
    px: number;
    py: number;
    cam2Px?: number;
    cam2Py?: number;
    z?: number;
  }[];
}
