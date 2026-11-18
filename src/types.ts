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
  azimuthDeg?: number | null; // Azimuth angle in degrees (Yaw)
  elevationDeg?: number | null; // Elevation angle in degrees (Pitch)
  rollDeg?: number | null; // Roll angle in degrees
  roll?: number | null; // Optional direct alias for Roll angle in degrees
  pitch?: number | null; // Optional direct alias for Pitch angle in degrees
  yaw?: number | null; // Optional direct alias for Yaw angle in degrees
  machNumber?: number | null; // Speed in Mach
  gForce?: number | null; // Total acceleration in Gs (a / 9.80665)
  // High-speed stereo asynchronous tracking metadata (when Cam 1 & Cam 2 frame rates differ)
  cam1Time?: number;
  cam2Time?: number;
  cam2Frame?: number;
  isInterpolatedCam1?: boolean;
  isInterpolatedCam2?: boolean;
  isInterpolated?: boolean;
  rejected?: boolean; // If true, observation is rejected and treated as a gap in plots
  temporalDeltaSeconds?: number;
  // Angular velocities & accelerations (deg/s, deg/s^2)
  omegaRoll?: number | null;
  omegaPitch?: number | null;
  omegaYaw?: number | null;
  alphaRoll?: number | null;
  alphaPitch?: number | null;
  alphaYaw?: number | null;
  // 1-Sigma Pose Uncertainties propagated from SE(3) Covariance Matrix Sigma_xi = s_0^2 (J^T W J)^{-1}
  sigmaX?: number | null; // meters (1-sigma)
  sigmaY?: number | null; // meters (1-sigma)
  sigmaZ?: number | null; // meters (1-sigma)
  sigmaRoll?: number | null; // degrees (1-sigma)
  sigmaPitch?: number | null; // degrees (1-sigma)
  sigmaYaw?: number | null; // degrees (1-sigma)
  reprojectionRMSE?: number | null; // pixels
  errorPct?: number | null; // %
  accuracyPct?: number | null; // %
  residualAbs?: number | null; // native physical units
  // Visible marker counts per rigid body group at frame t
  markerCountA?: number;
  markerCountL?: number;
  markerCountM?: number;
  // Multi-body relative reference frame telemetry for Store Separation (M wrt L, M wrt A, L wrt A, camera_world)
  relativeFrames?: {
    [key in RelativeReferenceFrameMode]?: {
      x: number;
      y: number;
      z: number;
      roll: number;
      pitch: number;
      yaw: number;
      rmsePx?: number;
      sigmaX?: number;
      sigmaY?: number;
      sigmaZ?: number;
      sigmaRoll?: number;
      sigmaPitch?: number;
      sigmaYaw?: number;
    };
  };
  // Virtual Critical Points transformed at frame t (e.g., Missile CG, Nose Tip, Aft Upper Fin Tip, Tail Boattail)
  virtualPoints?: {
    [virtualPointId: string]: {
      name: string;
      x: number; // in M_wrt_L (meters)
      y: number;
      z: number;
      clearanceM: number; // Euclidean clearance distance ||P_virt^L - P_ref^L||_2 in meters
      xAircraft?: number; // in M_wrt_A (meters)
      yAircraft?: number;
      zAircraft?: number;
      sigmaX?: number;
      sigmaY?: number;
      sigmaZ?: number;
    };
  };
}

export interface VirtualPoint3D {
  id: string;
  name: string;
  x: number; // Known Leica ACS / Missile Body X coordinate (m)
  y: number; // Known Leica ACS / Missile Body Y coordinate (m)
  z: number; // Known Leica ACS / Missile Body Z coordinate (m)
}

export interface ClearanceEnvelopeSummary {
  virtualPointId: string;
  virtualPointName: string;
  minClearanceMeters: number;
  minDistanceMeters: number;
  closestApproachFrame: number;
  closestApproachTimeSec: number;
  closestApproachTime: number;
}

export type AnalysisMode = '2D' | '3D' | '6DOF';

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
  rigidBodyGroup?: 'A' | 'L' | 'M';
  surveyMarkerId?: string;
  virtualPointsCatalog?: VirtualPoint3D[];
  clearanceEnvelope?: Record<string, ClearanceEnvelopeSummary>;
  overallMinClearance?: ClearanceEnvelopeSummary;
}

export interface Calibration {
  active: boolean;
  pointA: { x: number; y: number }; // video pixel coordinates
  pointB: { x: number; y: number };
  p1?: { x: number; y: number };
  p2?: { x: number; y: number };
  realLength: number; // known length in user's unit
  length?: number;
  unit: 'm' | 'cm' | 'mm' | 'ft';
  scale: number; // pixels per meter
  pixelsPerMeter?: number;
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

export type SixDofChannel = 'x' | 'y' | 'z' | 'roll' | 'pitch' | 'yaw';

export type PlotVariable =
  | 't'
  | 'x'
  | 'y'
  | 'z'
  | 'distX'
  | 'distY'
  | 'distZ'
  | 'pitch'
  | 'yaw'
  | 'roll'
  | 'pathLength'
  | 'vx'
  | 'vy'
  | 'vz'
  | 'v'
  | 'ax'
  | 'ay'
  | 'az'
  | 'a'
  | 'omegaRoll'
  | 'omegaPitch'
  | 'omegaYaw'
  | 'alphaRoll'
  | 'alphaPitch'
  | 'alphaYaw'
  | 'kineticEnergy'
  | 'potentialEnergy'
  | 'totalEnergy'
  | 'mach'
  | 'gForce'
  | 'slantRange'
  | 'errorPct'
  | 'reprojResidualPx'
  | 'triangulationSkewMm';

export type GraphAxisVariable = 't' | PlotVariable;

export type GraphTransformMode = 'signed' | 'abs' | 'magnitude' | 'path_length';

export type GraphViewLayout = 'dual-sync' | 'overlay' | 'single' | 'multi-stack' | 'telemetry-6dof';

export type AngleWrapMode = 'unwrapped' | 'shortest';

export type AngleUnit = 'deg' | 'rad';

export type AerospaceCoordConvention = 'ENU_Z_UP' | 'NED_Z_DOWN';

export type RelativeReferenceFrameMode = 'M_wrt_L' | 'M_wrt_A' | 'L_wrt_A' | 'camera_world';

export type SignalFilterType = 'raw' | 'savgol' | 'butterworth';

export interface SignalFilterConfig {
  type: SignalFilterType;
  windowSize: number; // e.g. 5, 7, 9, 11, 15, 21 for Savitzky-Golay
  polyOrder: 2 | 3; // 2 or 3 for Savitzky-Golay
  cutoffHz: number; // Cutoff frequency in Hz for 4th-order zero-phase Butterworth
}

export type PublicationPlotTheme = 'publication-light' | 'tactical-dark';

export type ChannelSignMode = 'standard' | 'inverted' | 'abs_positive';

export interface ChannelSignRule {
  channel: SixDofChannel;
  directionLabel: string; // e.g. 'Towards Nose (Forward)', 'Towards Right (Starboard)', 'Downwards (Nadir)'
  mode: ChannelSignMode;
  multiplier: 1 | -1;
  rectify: 'signed' | 'abs_positive';
}

export type SixDofSignMatrixConfig = Record<SixDofChannel, ChannelSignRule>;

export type MetrologyGrade = 'A' | 'B' | 'C';

export interface FrameErrorMetrics {
  frame: number;
  value: number | null;
  xValue?: number | null;
  sigmaAbs: number;
  xSigmaAbs?: number;
  errorPct: number;
  xErrorPct?: number;
  yErrorPct?: number;
  accuracyPct: number;
  residualAbs: number;
  absoluteUncertainty: number;
  reprojResidualPx: number;
  triangulationSkewMm: number;
  isOutlier2Sigma: boolean;
}

export interface MetrologyBudgetSource {
  id: string;
  sourceLabel: string;
  name: string;
  category: 'calibration' | 'centroid' | 'reprojection' | 'temporal_sync' | 'lever_arm' | 'kinematic_filter';
  contributionPct: number;
  errorPct: number;
  shareOfTotalPct: number;
  sharePct: number;
  absoluteValueStr: string;
  physicalResidualLabel: string;
  standardRef: string;
  description: string;
}

export interface AnalysisErrorReport {
  mode: '2D' | '3D' | '6DOF' | '2d' | '3d_stereo' | '6dof';
  channelName: string;
  channelLabel: string;
  varX: GraphAxisVariable;
  varY: PlotVariable;
  isParametric: boolean;
  sampleCount: number;
  spanY: number;
  refFloorY: number;
  effectiveDenominatorY: number;
  characteristicScale: number;
  spanX?: number;
  refFloorX?: number;
  effectiveDenominatorX?: number;
  meanErrorPct: number;
  rmsErrorPct: number; // NRMSE %
  nrmsePct: number; // Alias for rmsErrorPct
  maxErrorPct: number;
  worstFrameIndex: number;
  p95ErrorPct: number; // 2-sigma (95th percentile) error %
  overallAccuracyPct: number; // Math.max(0, 100 - rmsErrorPct)
  absoluteRMSE: number; // In channel's native physical units (m, mm, deg, m/s, m/s^2)
  unit: string;
  xAbsoluteRMSE?: number; // For parametric plots (varX !== 't')
  xUnit?: string;
  meanReprojResidualPx: number;
  meanReprojectionErrorPx: number;
  meanTriangulationSkewMm: number;
  filterAttenuationFactor: number; // eta_filt = min(1, sqrt(2 * fc * dt))
  metrologyGrade: MetrologyGrade;
  certificationGrade?: MetrologyGrade;
  metrologyGradeLabel: string;
  gradeDescription: string;
  budgetBreakdown: MetrologyBudgetSource[];
  frameMetrics: FrameErrorMetrics[];
  perFrame: FrameErrorMetrics[];
}


export interface GraphConfig {
  varY: PlotVariable;
  varX: GraphAxisVariable;
  selectedChannels?: SixDofChannel[];
  transformMode: GraphTransformMode;
  transformModeX?: 'signed' | 'abs';
  invertVarX?: boolean;
  panel2TransformMode?: 'abs' | 'magnitude' | 'path_length';
  viewMode: GraphViewLayout;
  referenceFrameT0?: number | null;
  relativeToOrigin?: boolean;
  useRelativeTime?: boolean;
  angleWrapMode?: AngleWrapMode;
  angleUnit?: AngleUnit;
  coordConvention?: AerospaceCoordConvention;
  channelSignConfig?: SixDofSignMatrixConfig;
  signConventionMatrix?: Record<string, any>;
  referenceFrameMode?: RelativeReferenceFrameMode;
  activeVirtualPointId?: string;
  showUncertaintyBand?: boolean;
  publicationTheme?: PublicationPlotTheme;
  dualGraphSplitPct?: number; // Top/Bottom ratio in Dual-Sync mode (0 = Bottom Only, 50 = Dual 50/50, 100 = Top Only)
  showSettingsDrawer?: boolean;
  invertChannels?: Partial<Record<SixDofChannel, boolean>>;
  filterConfig?: SignalFilterConfig;
  showOverlayDistance?: boolean;
  showLegend?: boolean;
  fitType?: FitType;
  zoomDomainX?: [number, number] | null;
  zoomDomainY?: [number, number] | null;
}

export interface StereoSyncConfig {
  anchorFrameCam1: number; // n
  anchorFrameCam2: number; // m
  fpsCam1: number; // f1
  fpsCam2: number; // f2
  toleranceSec: number; // tolerance, e.g. 0.005 s (5ms)
  playbackMaster: 'cam1' | 'cam2' | 'both';
  clipInCam1?: number;
  clipOutCam1?: number;
  clipInCam2?: number;
  clipOutCam2?: number;
}

export interface StereoSyncStatus {
  frameCam1: number;
  frameCam2: number;
  timeCam1: number;
  timeCam2: number;
  deltaTimeSyncSec: number;
  deltaTimeSyncMs: number;
  isSynchronized: boolean;
  status: 'synchronized' | 'within_tolerance' | 'outside_tolerance';
  message: string;
}

export interface CameraClipConfig {
  sourceName: string;
  sourceUrl?: string;
  fps: number;
  totalFrames: number;
  durationSec: number;
  syncAnchorFrame: number;
  currentFrame: number;
  clipInFrame: number;
  clipOutFrame: number;
  playbackSpeed: number;
  stepSize: number;
  startTimeSec: number;
  timeUnit?: 'auto' | 's' | 'ms' | 'us' | 'ns';
}

export type WorkspaceAnalysisMode = '2D' | '3D' | '6DOF';

export interface VideoTelemetryMetadata {
  fileName: string;
  fileSize?: number;
  duration?: number;
  width: number;
  height: number;
  sensorFps: number;
  totalFrames: number;
}

export interface SavedProjectData {
  version: string; // '2.1.0'
  analysisMode: WorkspaceAnalysisMode;
  timestamp: string;
  experimentTitle: string;
  currentExpId?: string;
  activeTrackId?: string;
  currentFrame?: number;
  isSynthetic?: boolean;
  syntheticType?: string;
  videoMetadata?: VideoTelemetryMetadata;
  videoMetadataCam2?: VideoTelemetryMetadata;
  sixDofState?: {
    referenceFrameMode?: RelativeReferenceFrameMode;
    activeVirtualPointId?: string;
    coordConvention?: AerospaceCoordConvention;
    channelSignConfig?: SixDofSignMatrixConfig;
    filterConfig?: SignalFilterConfig;
    fiducialCount?: number;
    poseCount?: number;
    activeModelId?: string;
    mWrtLConfig?: any;
    virtualPoints?: any[];
    [key: string]: any;
  };
  camera1: {
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
  synchronization?: StereoSyncConfig;
  triangulation?: TriangulationConfig;
  calibration?: Calibration; // backward-compatibility
  clip?: ClipSettings; // backward-compatibility
  axes: CoordinateAxes;
  tracks: Track[];
  graphConfig?: GraphConfig;
}

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
  syncConfig?: StereoSyncConfig; // Explicit (n, m) anchor synchronization model
  calibrationCam1?: Calibration; // Independent Camera 1 calibration stick
  calibrationCam2?: Calibration; // Independent Camera 2 calibration stick
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
  calibrationCam2?: Calibration;
  axes: CoordinateAxes;
  clip: ClipSettings;
  clipCam2?: ClipSettings;
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
