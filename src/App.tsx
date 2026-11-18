import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Toolbar, ViewLayout } from './components/Toolbar';
import { VideoPlayerView } from './components/VideoPlayerView';
import { DualVideoPlayerView } from './components/DualVideoPlayerView';
import { ThreeDTrajectoryView } from './components/ThreeDTrajectoryView';
import { PlotView } from './components/PlotView';
import { TableView, buildCertifiedDefenseTelemetryCSV } from './components/TableView';
import { CalibrationModal } from './components/CalibrationModal';
import { ClipSettingsModal } from './components/ClipSettingsModal';
import { TrackManagerModal } from './components/TrackManagerModal';
import { TriangulationModal } from './components/TriangulationModal';
import { HelpModal } from './components/HelpModal';
import { SupportedFormatsModal, FormatsModalTab } from './components/SupportedFormatsModal';
import { FormatWarningToast } from './components/FormatWarningToast';
import { DownloadExeModal } from './components/DownloadExeModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ExperimentReportModal } from './components/ExperimentReportModal';
import { Monocular6DoFModal } from './components/Monocular6DoFModal';
import { MetrologyAuditModal } from './components/MetrologyAuditModal';
import { AviHighSpeedLoader } from './video/aviHighSpeedLoader';
import { loadUniversalVideoFile } from './video/universalVideoDecoder';
import { SAMPLE_EXPERIMENTS } from './data/samples';
import {
  Track,
  Calibration,
  CoordinateAxes,
  ClipSettings,
  PointStep,
  SampleExperiment,
  TriangulationConfig,
  GraphConfig,
} from './types';
import { DEFAULT_GRAPH_CONFIG, deriveSixChannelSeries } from './utils/sixChannelGraphing';
import { computeKinematics, pixelToWorld } from './utils/physics';
import {
  computeKinematics3D,
  buildDefaultDLT,
  triangulateDLT,
} from './utils/triangulation';
import {
  extractVideoFromArchive,
  probeVideoMetadata,
  VideoMetadataProbeResult,
} from './utils/videoFormats';
import {
  serializeProject,
  serializeProjectToTrk,
  validateAndParseProject,
  ingestWorkstationFile,
  saveProjectToFolderOrBundle,
  saveSessionToLocalStorage,
  loadSynchronousSessionSnapshot,
  saveWorkspaceToIndexedDB,
  loadWorkspaceFromIndexedDB,
  saveWorkspaceMediaToIndexedDB,
  findCachedVideoForProject,
  clearSavedWorkspaceSession,
} from './utils/projectPersistence';
import { mediaDiagnostics } from './utils/mediaDiagnostics';
import {
  CheckCircle2,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  GripVertical,
  GripHorizontal,
  Video,
  Activity,
  Compass,
  Table as TableIcon,
} from 'lucide-react';

export const App: React.FC = () => {
  // Strict hydration lock: prevents any auto-save useEffect from overwriting user work
  // before synchronous LocalStorage + asynchronous IndexedDB restoration finishes.
  const isHydratedRef = useRef<boolean>(false);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [pendingRelinkVideoName, setPendingRelinkVideoName] = useState<string | null>(null);
  const relinkInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronously load any auto-saved session from localStorage so refreshing or reopening
  // never wipes user work or overwrites it with SAMPLE_EXPERIMENTS[0].
  const initialRestoredSessionRef = useRef<ReturnType<typeof loadSynchronousSessionSnapshot> | undefined>(undefined);
  if (initialRestoredSessionRef.current === undefined) {
    initialRestoredSessionRef.current = loadSynchronousSessionSnapshot();
  }
  const initialSession = initialRestoredSessionRef.current;

  const resolveInitialExperiment = (): SampleExperiment => {
    if (initialSession) {
      const matchedSample = SAMPLE_EXPERIMENTS.find(
        (s) => s.id === initialSession.currentExpId
      );
      if (matchedSample) {
        return {
          ...matchedSample,
          title: initialSession.experimentTitle || matchedSample.title,
          calibration: initialSession.calibration || matchedSample.calibration,
          axes: initialSession.axes || matchedSample.axes,
          clip: initialSession.clip || matchedSample.clip,
          triangulation: initialSession.triangulation || matchedSample.triangulation,
        };
      }
      return {
        ...SAMPLE_EXPERIMENTS[0],
        id: initialSession.currentExpId || 'restored-session',
        title: initialSession.experimentTitle || 'Restored Project',
        description: `Restored workspace (${initialSession.experimentTitle || 'Session'})`,
        category: 'custom',
        videoUrl: initialSession.camera1?.videoUrl || '',
        videoUrlCam2: initialSession.camera2?.videoUrl || '',
        syntheticType: initialSession.syntheticType ?? (initialSession.camera1?.videoUrl ? undefined : SAMPLE_EXPERIMENTS[0].syntheticType),
        is3D: initialSession.analysisMode === '3D',
        calibration: initialSession.calibration || SAMPLE_EXPERIMENTS[0].calibration,
        axes: initialSession.axes || SAMPLE_EXPERIMENTS[0].axes,
        clip: initialSession.clip || SAMPLE_EXPERIMENTS[0].clip,
        triangulation: initialSession.triangulation || SAMPLE_EXPERIMENTS[0].triangulation,
      };
    }
    return SAMPLE_EXPERIMENTS[0];
  };

  const initialExpObj = resolveInitialExperiment();

  // Current experiment
  const [currentExp, setCurrentExp] = useState<SampleExperiment>(initialExpObj);
  const [videoUrl, setVideoUrl] = useState<string>(
    initialSession?.camera1?.videoUrl ?? initialExpObj.videoUrl
  );
  const [videoUrlCam2, setVideoUrlCam2] = useState<string>(
    initialSession?.camera2?.videoUrl ?? (initialExpObj.videoUrlCam2 || '')
  );
  const [isSynthetic, setIsSynthetic] = useState<boolean>(
    initialSession?.isSynthetic !== undefined
      ? initialSession.isSynthetic
      : Boolean(initialExpObj.syntheticType)
  );

  // Active uploaded local video File references (persisted in IndexedDB & bundled into .zip exports)
  const activeVideoFileCam1Ref = useRef<File | null>(null);
  const activeVideoFileCam2Ref = useRef<File | null>(null);

  // Analysis mode: 2D Single Video, 3D Stereo Video, or Monocular 6-DOF Store Separation
  const [analysisMode, setAnalysisMode] = useState<'2D' | '3D' | '6DOF'>(
    initialSession?.analysisMode ?? (SAMPLE_EXPERIMENTS[0].is3D ? '3D' : '2D')
  );
  const [aviLoader, setAviLoader] = useState<AviHighSpeedLoader | null>(null);
  const [aviLoaderCam2, setAviLoaderCam2] = useState<AviHighSpeedLoader | null>(null);
  const [transcodeProgress, setTranscodeProgress] = useState<{ percent: number; text: string } | null>(null);

  // Calibration
  const [calibration, setCalibration] = useState<Calibration>(
    initialSession?.calibration || SAMPLE_EXPERIMENTS[0].calibration
  );

  // Coordinate Axes
  const [axes, setAxes] = useState<CoordinateAxes>(
    initialSession?.axes || SAMPLE_EXPERIMENTS[0].axes
  );

  // 3D Triangulation Config
  const [triangulation, setTriangulation] = useState<TriangulationConfig>(
    initialSession?.triangulation ||
      SAMPLE_EXPERIMENTS[0].triangulation || {
        method: 'orthogonal-front-side',
        pixelsPerMeterCam1: 240,
        pixelsPerMeterCam2: 240,
        originCam1: { x: 120, y: 380 },
        originCam2: { x: 120, y: 380 },
        baselineMeters: 1.2,
        convergenceAngleDeg: 90,
        calibrated: true,
        meanResidualMeters: 0.002,
      }
  );

  // Clip settings
  const [clip, setClip] = useState<ClipSettings>(
    initialSession?.clip || SAMPLE_EXPERIMENTS[0].clip
  );

  // Playback / scrubber frame
  const [currentFrame, setCurrentFrame] = useState<number>(
    initialSession?.currentFrame ?? initialSession?.clip?.startFrame ?? 0
  );

  // Tracks / Point Masses
  const [tracks, setTracks] = useState<Track[]>(() => {
    if (initialSession && Array.isArray(initialSession.tracks) && initialSession.tracks.length > 0) {
      return initialSession.tracks;
    }

    const defaultExp = SAMPLE_EXPERIMENTS[0];
    const initialSteps: PointStep[] = (defaultExp.samplePoints || []).map((pt) => {
      const world = pixelToWorld(pt.px, pt.py, defaultExp.axes, defaultExp.calibration);
      const time = (pt.frame - defaultExp.clip.startFrame) * (1 / defaultExp.clip.fps);
      const fps2 = defaultExp.triangulation?.fpsCam2 || defaultExp.clip.fps;
      const offset = defaultExp.triangulation?.timeOffsetCam2Sec || 0;
      return {
        frame: pt.frame,
        time,
        px: pt.px,
        py: pt.py,
        cam1: { px: pt.px, py: pt.py },
        cam2: pt.cam2Px !== undefined && pt.cam2Py !== undefined ? { px: pt.cam2Px, py: pt.cam2Py } : undefined,
        cam1Px: pt.px,
        cam1Py: pt.py,
        cam2Px: pt.cam2Px,
        cam2Py: pt.cam2Py,
        cam1Time: time,
        cam2Time: time - offset,
        cam2Frame: Math.round((time - offset) * fps2),
        isInterpolatedCam1: false,
        isInterpolatedCam2: (pt as any).isInterpolatedCam2 ?? false,
        temporalDeltaSeconds: (pt as any).temporalDeltaSeconds ?? 0,
        x: world.x,
        y: world.y,
        z: pt.z,
      };
    });

    const computed = defaultExp.is3D
      ? computeKinematics3D(initialSteps, 0.1)
      : computeKinematics(initialSteps, 0.1);

    return [
      {
        id: 'track-1',
        name: 'Mass A',
        color: '#3b82f6',
        mass: 0.1,
        footprint: 'circle',
        steps: computed,
        visible: true,
        showVectors: true,
        showTrails: true,
        showLabels: true,
      },
    ];
  });

  const [activeTrackId, setActiveTrackId] = useState<string>(
    initialSession?.activeTrackId || initialSession?.tracks?.[0]?.id || 'track-1'
  );

  // Six-Channel Graphing Configuration State (Requirement 9: Full Persistence)
  const [graphConfig, setGraphConfig] = useState<GraphConfig>(() => {
    if (initialSession?.graphConfig) {
      return { ...DEFAULT_GRAPH_CONFIG, ...initialSession.graphConfig };
    }
    try {
      const saved = localStorage.getItem('tracker_graph_config_v2');
      if (saved) {
        return { ...DEFAULT_GRAPH_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_GRAPH_CONFIG };
  });

  const handleUpdateGraphConfig = useCallback((updates: Partial<GraphConfig>) => {
    setGraphConfig((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem('tracker_graph_config_v2', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Display toggles
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [showLoupe, setShowLoupe] = useState<boolean>(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);

  // Layout switcher: default to split-3d when 3D is active
  const [layout, setLayout] = useState<ViewLayout>(() => {
    const mode = initialSession?.analysisMode ?? (SAMPLE_EXPERIMENTS[0].is3D ? '3D' : '2D');
    return mode === '3D' ? 'split-3d' : 'split';
  });

  // Interactive Draggable Split-Pane State (persisted to localStorage)
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tracker_split_left_width_pct');
      if (saved) return Math.max(18, Math.min(85, Number(saved) || 50));
    } catch {
      // ignore
    }
    return 50;
  });

  const [topRightHeightPct, setTopRightHeightPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tracker_split_top_right_height_pct');
      if (saved) return Math.max(15, Math.min(85, Number(saved) || 55));
    } catch {
      // ignore
    }
    return 55;
  });

  const [leftTopHeightPct, setLeftTopHeightPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tracker_split_left_top_height_pct');
      if (saved) return Math.max(15, Math.min(85, Number(saved) || 55));
    } catch {
      // ignore
    }
    return 55;
  });

  const [maximizedPanel, setMaximizedPanel] = useState<
    'none' | 'video' | '3d' | 'graph' | 'table'
  >('none');
  const [isTableCollapsed, setIsTableCollapsed] = useState<boolean>(false);
  const [isLeftPaneCollapsed, setIsLeftPaneCollapsed] = useState<boolean>(false);
  const [isRightPaneCollapsed, setIsRightPaneCollapsed] = useState<boolean>(false);
  const [isPanesSwapped, setIsPanesSwapped] = useState<boolean>(false);

  const mainStageRef = useRef<HTMLElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);

  const updateLeftPaneWidth = useCallback((pct: number) => {
    const clamped = Math.max(18, Math.min(85, Math.round(pct * 10) / 10));
    setLeftPaneWidthPct(clamped);
    try {
      localStorage.setItem('tracker_split_left_width_pct', String(clamped));
    } catch {
      // ignore
    }
  }, []);

  const updateTopRightHeight = useCallback((pct: number) => {
    const clamped = Math.max(15, Math.min(85, Math.round(pct * 10) / 10));
    setTopRightHeightPct(clamped);
    try {
      localStorage.setItem('tracker_split_top_right_height_pct', String(clamped));
    } catch {
      // ignore
    }
  }, []);

  const updateLeftTopHeight = useCallback((pct: number) => {
    const clamped = Math.max(15, Math.min(85, Math.round(pct * 10) / 10));
    setLeftTopHeightPct(clamped);
    try {
      localStorage.setItem('tracker_split_left_top_height_pct', String(clamped));
    } catch {
      // ignore
    }
  }, []);

  // One-Click Workflow Focus Preset Switcher
  const handleLayoutChange = useCallback(
    (nextLayout: ViewLayout) => {
      setLayout(nextLayout);
      setMaximizedPanel('none');
      setIsLeftPaneCollapsed(false);
      setIsRightPaneCollapsed(false);

      if (nextLayout === 'video-only') {
        // Video Tracking Focus: 100% Video Canvas (or 85% when mini inspector expanded)
        updateLeftPaneWidth(85);
      } else if (nextLayout === 'video-plot') {
        // Graph & Telemetry Focus: 24% Live Video Reference Monitor + 76% Graph Inspector + Collapsed Table Status Bar
        updateLeftPaneWidth(24);
        setIsTableCollapsed(true);
        handleUpdateGraphConfig({ showSettingsDrawer: false });
      } else if (nextLayout === 'split') {
        // Balanced Split View: 50% / 50%
        updateLeftPaneWidth(50);
        updateTopRightHeight(55);
        setIsTableCollapsed(false);
      } else if (nextLayout === 'split-3d') {
        // Quad Telemetry Grid: 50% / 50%
        updateLeftPaneWidth(50);
        updateLeftTopHeight(55);
        updateTopRightHeight(55);
        setIsTableCollapsed(false);
      } else if (nextLayout === 'trajectory-3d') {
        updateLeftPaneWidth(55);
        updateTopRightHeight(55);
        setIsTableCollapsed(false);
      } else if (nextLayout === 'video-table') {
        updateLeftPaneWidth(50);
        setIsTableCollapsed(false);
      }
    },
    [updateLeftPaneWidth, updateTopRightHeight, updateLeftTopHeight, handleUpdateGraphConfig]
  );

  // Vertical Splitter Drag Handler (18% Left / 82% Right to 85% Left / 15% Right)
  const handleStartVerticalSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!mainStageRef.current) return;
      const rect = mainStageRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relX = moveEvent.clientX - rect.left;
      const rawPct = (relX / rect.width) * 100;
      const targetPct = isPanesSwapped ? 100 - rawPct : rawPct;
      updateLeftPaneWidth(targetPct);
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Horizontal Splitter Drag Handler (Right Telemetry Pane: Graph vs Table)
  const handleStartRightHorizontalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!rightPaneRef.current) return;
      const rect = rightPaneRef.current.getBoundingClientRect();
      if (rect.height <= 0) return;
      const relY = moveEvent.clientY - rect.top;
      updateTopRightHeight((relY / rect.height) * 100);
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Horizontal Splitter Drag Handler (Left Visual Pane in Quad Mode: Video vs 3D Viewport)
  const handleStartLeftHorizontalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!leftPaneRef.current) return;
      const rect = leftPaneRef.current.getBoundingClientRect();
      if (rect.height <= 0) return;
      const relY = moveEvent.clientY - rect.top;
      updateLeftTopHeight((relY / rect.height) * 100);
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Tracker OSP Safety: require Shift+Click to mark points (prevents accidental clicks from adding points)
  const [requireShiftToMark, setRequireShiftToMark] = useState<boolean>(true);

  // Modals
  const [isCalModalOpen, setIsCalModalOpen] = useState(false);
  const [isClipModalOpen, setIsClipModalOpen] = useState(false);
  const [isTrackManagerOpen, setIsTrackManagerOpen] = useState(false);
  const [isTriModalOpen, setIsTriModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFormatsModalOpen, setIsFormatsModalOpen] = useState(false);
  const [formatsModalInitialTab, setFormatsModalInitialTab] = useState<FormatsModalTab>('catalog');
  const [formatWarningProbe, setFormatWarningProbe] = useState<VideoMetadataProbeResult | null>(null);
  const [isDownloadExeOpen, setIsDownloadExeOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isMonocular6DoFOpen, setIsMonocular6DoFOpen] = useState(false);
  const [isMetrologyAuditOpen, setIsMetrologyAuditOpen] = useState(false);
  const [metrologyAuditPanel, setMetrologyAuditPanel] = useState<'panel1' | 'panel2'>('panel1');
  const [videoSnapshotUrl, setVideoSnapshotUrl] = useState<string | null>(null);
  const snapshotGetterRef = useRef<(() => string | null) | null>(null);

  // Save / project notification toast
  const [saveToast, setSaveToast] = useState<{ message: string; sub?: string } | null>(null);
  const saveToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, sub?: string) => {
    setSaveToast({ message, sub });
    if (saveToastTimerRef.current) clearTimeout(saveToastTimerRef.current);
    saveToastTimerRef.current = setTimeout(() => setSaveToast(null), 3500);
  }, []);

  // Object URL lifecycle management to prevent memory leaks and dangling media streams
  const activeBlobUrlCam1Ref = useRef<string | null>(null);
  const activeBlobUrlCam2Ref = useRef<string | null>(null);
  const pendingRevokeUrlsRef = useRef<Set<string>>(new Set());

  const registerBlobUrl = useCallback((newUrl: string, target: 'cam1' | 'cam2' = 'cam1') => {
    const oldUrl = target === 'cam1' ? activeBlobUrlCam1Ref.current : activeBlobUrlCam2Ref.current;
    if (oldUrl && oldUrl.startsWith('blob:') && oldUrl !== newUrl) {
      pendingRevokeUrlsRef.current.add(oldUrl);
      setTimeout(() => {
        if (pendingRevokeUrlsRef.current.has(oldUrl)) {
          pendingRevokeUrlsRef.current.delete(oldUrl);
          try {
            URL.revokeObjectURL(oldUrl);
          } catch {
            // ignore
          }
        }
      }, 2500);
    }

    if (target === 'cam1') {
      activeBlobUrlCam1Ref.current = newUrl.startsWith('blob:') ? newUrl : null;
    } else {
      activeBlobUrlCam2Ref.current = newUrl.startsWith('blob:') ? newUrl : null;
    }
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      pendingRevokeUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
      pendingRevokeUrlsRef.current.clear();
      if (activeBlobUrlCam1Ref.current && activeBlobUrlCam1Ref.current.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(activeBlobUrlCam1Ref.current);
        } catch {
          // ignore
        }
      }
      if (activeBlobUrlCam2Ref.current && activeBlobUrlCam2Ref.current.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(activeBlobUrlCam2Ref.current);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleOpenReportModal = () => {
    if (snapshotGetterRef.current) {
      const snap = snapshotGetterRef.current();
      setVideoSnapshotUrl(snap);
    }
    setIsReportModalOpen(true);
  };

  const handleOpenFormatsModal = (tab: FormatsModalTab = 'catalog') => {
    setFormatsModalInitialTab(tab);
    setIsFormatsModalOpen(true);
  };

  // Recompute world coordinates and kinematics for all tracks when axes or calibration changes (2D)
  const refreshAllTrackKinematics = useCallback(
    (currentTracks: Track[], currentAxes: CoordinateAxes, currentCal: Calibration) => {
      return currentTracks.map((trk) => {
        const updatedSteps: PointStep[] = trk.steps.map((step) => {
          const world = pixelToWorld(step.px, step.py, currentAxes, currentCal);
          return {
            ...step,
            x: world.x,
            y: world.y,
          };
        });
        return {
          ...trk,
          steps: computeKinematics(updatedSteps, trk.mass),
        };
      });
    },
    []
  );

  // Toggle or switch analysis mode
  const handleChangeAnalysisMode = (mode: '2D' | '3D' | '6DOF') => {
    setAnalysisMode(mode);
    if (mode === '3D') {
      if (layout === 'split') setLayout('split-3d');
    } else if (mode === '6DOF') {
      if (layout === 'video-only') setLayout('split');
    } else {
      if (layout === 'split-3d' || layout === 'trajectory-3d') setLayout('split');
    }
  };

  // Handle Experiment Selection
  const handleSelectExperiment = (exp: SampleExperiment) => {
    mediaDiagnostics.setSession(exp.id);
    if (aviLoader) {
      aviLoader.dispose();
      setAviLoader(null);
    }
    if (aviLoaderCam2) {
      aviLoaderCam2.dispose();
      setAviLoaderCam2(null);
    }
    registerBlobUrl('', 'cam1');
    registerBlobUrl('', 'cam2');
    setPendingRelinkVideoName(null);
    setCurrentExp(exp);
    setVideoUrl(exp.videoUrl);
    setVideoUrlCam2(exp.videoUrlCam2 || '');
    setIsSynthetic(Boolean(exp.syntheticType));
    setCalibration(exp.calibration);
    setAxes(exp.axes);
    setClip(exp.clip);
    setCurrentFrame(exp.clip.startFrame);

    if (exp.is3D) {
      setAnalysisMode('3D');
      setLayout('split-3d');
      if (exp.triangulation) {
        setTriangulation(exp.triangulation);
      }
    } else {
      setAnalysisMode('2D');
      setLayout('split');
    }

    const initialSteps: PointStep[] = (exp.samplePoints || []).map((pt) => {
      const world = pixelToWorld(pt.px, pt.py, exp.axes, exp.calibration);
      const time = (pt.frame - exp.clip.startFrame) * (1 / exp.clip.fps);
      const fps2 = exp.triangulation?.fpsCam2 || exp.clip.fps;
      const offset = exp.triangulation?.timeOffsetCam2Sec || 0;
      return {
        frame: pt.frame,
        time,
        px: pt.px,
        py: pt.py,
        cam1: { px: pt.px, py: pt.py },
        cam2: pt.cam2Px !== undefined && pt.cam2Py !== undefined ? { px: pt.cam2Px, py: pt.cam2Py } : undefined,
        cam1Px: pt.px,
        cam1Py: pt.py,
        cam2Px: pt.cam2Px,
        cam2Py: pt.cam2Py,
        cam1Time: time,
        cam2Time: time - offset,
        cam2Frame: Math.round((time - offset) * fps2),
        isInterpolatedCam1: false,
        isInterpolatedCam2: (pt as any).isInterpolatedCam2 ?? false,
        temporalDeltaSeconds: (pt as any).temporalDeltaSeconds ?? 0,
        x: world.x,
        y: world.y,
        z: pt.z,
      };
    });

    const computed = exp.is3D
      ? computeKinematics3D(initialSteps, 0.1)
      : computeKinematics(initialSteps, 0.1);

    setTracks([
      {
        id: 'track-1',
        name: 'Mass A',
        color: '#3b82f6',
        mass: 0.1,
        footprint: 'circle',
        steps: computed,
        visible: true,
        showVectors: true,
        showTrails: true,
        showLabels: true,
      },
    ]);
    setActiveTrackId('track-1');
    setUndoStack([]);
    setRedoStack([]);
  };

  // Helper to extract video from .trz / .zip archives or pass through regular videos
  const resolveUploadedFile = async (rawFile: File): Promise<File> => {
    const ext = rawFile.name.toLowerCase();
    if (ext.endsWith('.trz') || ext.endsWith('.zip')) {
      try {
        const extracted = await extractVideoFromArchive(rawFile);
        return extracted.videoFile;
      } catch (err) {
        console.warn('Could not extract archive as zip/trz, attempting native loading:', err);
      }
    }
    return rawFile;
  };

  // Handle Custom Video Upload with 3-Tier Universal Video Demuxer & Codec Engine (.MP4, .AVI, .WMV, .FLV, .MOV)
  // Also transparently routes .trk, .json, and project .zip bundles via Universal Magic-Byte Router!
  const handleUploadVideo = async (rawFile: File, preserveExistingTracks = false) => {
    if (!preserveExistingTracks) {
      const routed = await ingestWorkstationFile(rawFile);
      if (routed.kind === 'project') {
        if (routed.valid && routed.data) {
          await applyRestoredProjectData(
            routed.data,
            routed.videoFileCam1,
            routed.videoFileCam2,
            rawFile.name
          );
        } else {
          showToast(
            'Invalid Project File',
            routed.error ||
              routed.errors?.join('; ') ||
              'Could not parse .trk / .zip project file'
          );
        }
        return;
      }
    }

    const file = await resolveUploadedFile(rawFile);
    activeVideoFileCam1Ref.current = file;
    void saveWorkspaceMediaToIndexedDB('cam1', file, file.name);
    setPendingRelinkVideoName(null);

    if (aviLoader) {
      aviLoader.dispose();
      setAviLoader(null);
    }

    const isGif = file.name.toLowerCase().endsWith('.gif') || file.type === 'image/gif';
    if (!isGif) {
      try {
        const result = await loadUniversalVideoFile(file, (percent, statusText) => {
          setTranscodeProgress({ percent, text: statusText });
        });
        setTranscodeProgress(null);

        const fpsVal = Math.max(1, Math.round(result.fps || 30));
        const totalFramesVal = Math.max(1, result.totalFrames || 60);
        const universalClip: ClipSettings = {
          startFrame: preserveExistingTracks ? clip.startFrame : 0,
          endFrame: preserveExistingTracks ? Math.max(clip.endFrame, totalFramesVal - 1) : totalFramesVal - 1,
          stepSize: preserveExistingTracks ? clip.stepSize : 1,
          fps: preserveExistingTracks ? clip.fps : fpsVal,
          startTime: preserveExistingTracks ? clip.startTime : 0.0,
          frameDt: preserveExistingTracks ? clip.frameDt : 1 / fpsVal,
          dt: preserveExistingTracks ? clip.dt : 1 / fpsVal,
          totalFrames: preserveExistingTracks ? Math.max(clip.totalFrames, totalFramesVal) : totalFramesVal,
        };

        setAviLoader(result.frameLoader);
        setFormatWarningProbe(null);
        registerBlobUrl(result.videoUrl, 'cam1');
        setVideoUrl(result.videoUrl);
        setIsSynthetic(false);
        if (!preserveExistingTracks) {
          setCurrentFrame(0);
        }
        setClip(universalClip);

        if (analysisMode !== '3D' && analysisMode !== '6DOF') {
          setAnalysisMode('2D');
          if (layout === 'split-3d' || layout === 'trajectory-3d') {
            setLayout('split');
          }
        }

        if (!preserveExistingTracks) {
          const uploadSessionId = `custom-${result.container.toLowerCase()}-${Date.now()}`;
          mediaDiagnostics.setSession(uploadSessionId, file.name);
          setCurrentExp({
            id: uploadSessionId,
            title: file.name,
            description: `${result.tierDescription} • ${result.diagnosticsSummary}`,
            category: 'custom',
            videoUrl: result.videoUrl,
            syntheticType: undefined,
            is3D: analysisMode === '3D',
            calibration: { ...calibration },
            axes: { ...axes },
            clip: universalClip,
          });
        } else {
          setCurrentExp((prev) => ({
            ...prev,
            videoUrl: result.videoUrl,
            syntheticType: undefined,
            clip: universalClip,
          }));
        }

        setTracks((prev) => {
          if (prev.some((t) => t.steps && t.steps.length > 0)) {
            return prev;
          }
          return [
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
          ];
        });

        showToast(
          preserveExistingTracks
            ? `Video Relinked: ${file.name} (${totalFramesVal} frames @ ${fpsVal} fps)`
            : `${result.container} Loaded (${totalFramesVal} frames @ ${fpsVal} fps)`,
          `${result.tierDescription} • ${result.width}×${result.height}`
        );
        return;
      } catch (universalErr) {
        setTranscodeProgress(null);
        console.warn('Universal video loader fallback to standard probe:', universalErr);
      }
    }

    // Client-side video metadata probe to detect unsupported or sub-optimal codec profiles
    probeVideoMetadata(file)
      .then((result) => {
        if (result.warningLevel !== 'none') {
          setFormatWarningProbe(result);
        } else {
          setFormatWarningProbe(null);
        }
      })
      .catch((err) => {
        console.warn('Metadata probe check error:', err);
      });

    const url = URL.createObjectURL(file);
    registerBlobUrl(url, 'cam1');
    setVideoUrl(url);
    setIsSynthetic(false);
    setCurrentFrame(0);
    // Requirement 6: Protect analysis mode - do not arbitrarily force 2D if in 3D or 6DOF mode
    if (analysisMode !== '3D' && analysisMode !== '6DOF') {
      setAnalysisMode('2D');
      if (layout === 'split-3d' || layout === 'trajectory-3d') {
        setLayout('split');
      }
    }

    // Initial safe generous clip setting while probing metadata
    const initialClip: ClipSettings = {
      startFrame: 0,
      endFrame: 9999,
      stepSize: 1,
      fps: 30,
      startTime: 0.0,
      frameDt: 1 / 30,
      dt: 1 / 30,
      totalFrames: 10000,
    };
    setClip(initialClip);

    const uploadSessionId = 'custom-upload-' + Date.now();
    mediaDiagnostics.setSession(uploadSessionId, file.name);

    setCurrentExp({
      id: uploadSessionId,
      title: file.name,
      description: `Custom video analysis (${file.name})`,
      category: 'custom',
      videoUrl: url,
      syntheticType: undefined,
      is3D: analysisMode === '3D',
      calibration: { ...calibration },
      axes: { ...axes },
      clip: initialClip,
    });

    if (isGif) {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const calculatedFrames = 60; // Standard 2-second default animation cycle
        const updatedClip: ClipSettings = {
          startFrame: 0,
          endFrame: calculatedFrames - 1,
          stepSize: 1,
          fps: 30,
          startTime: 0.0,
          frameDt: 1 / 30,
          dt: 1 / 30,
          totalFrames: calculatedFrames,
        };
        setClip(updatedClip);
        setCurrentExp((prev) => ({
          ...prev,
          clip: updatedClip,
        }));
      };
    } else {
      // Probe duration from HTML5 video element with proper resource cleanup
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.muted = true;
      probe.src = url;
      const cleanupProbe = () => {
        probe.onloadedmetadata = null;
        probe.ondurationchange = null;
        probe.onerror = null;
        try {
          probe.removeAttribute('src');
          probe.load();
        } catch {
          // ignore
        }
      };
      const onProbeMeta = () => {
        const dur = probe.duration;
        if (Number.isFinite(dur) && dur > 0) {
          const calculatedFrames = Math.max(10, Math.round(dur * 30));
          const updatedClip: ClipSettings = {
            startFrame: 0,
            endFrame: calculatedFrames - 1,
            stepSize: 1,
            fps: 30,
            startTime: 0.0,
            frameDt: 1 / 30,
            dt: 1 / 30,
            totalFrames: calculatedFrames,
          };
          setClip(updatedClip);
          setCurrentExp((prev) => ({
            ...prev,
            clip: updatedClip,
          }));
          cleanupProbe();
        }
      };
      probe.onloadedmetadata = onProbeMeta;
      probe.ondurationchange = onProbeMeta;
      probe.onerror = cleanupProbe;
      setTimeout(cleanupProbe, 5000);
    }

    // Requirement 6: Protect existing points from being wiped on video upload
    setTracks((prev) => {
      if (prev.some((t) => t.steps && t.steps.length > 0)) {
        return prev;
      }
      return [
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
      ];
    });
  };

  const handleUploadCam1 = async (rawFile: File) => {
    const routed = await ingestWorkstationFile(rawFile);
    if (routed.kind === 'project') {
      await handleOpenProjectFile(rawFile);
      return;
    }

    const file = await resolveUploadedFile(rawFile);
    activeVideoFileCam1Ref.current = file;
    void saveWorkspaceMediaToIndexedDB('cam1', file, file.name);
    setPendingRelinkVideoName(null);

    if (aviLoader) {
      aviLoader.dispose();
      setAviLoader(null);
    }

    try {
      const result = await loadUniversalVideoFile(file, (percent, statusText) => {
        setTranscodeProgress({ percent, text: `Camera 1: ${statusText}` });
      });
      setTranscodeProgress(null);

      setAviLoader(result.frameLoader);
      setFormatWarningProbe(null);
      registerBlobUrl(result.videoUrl, 'cam1');
      setVideoUrl(result.videoUrl);
      setIsSynthetic(false);

      const uploadSessionId = 'custom-cam1-' + Date.now();
      mediaDiagnostics.setSession(uploadSessionId, file.name);
      const calculatedFrames = Math.max(10, result.totalFrames || 60);
      setClip((prev) => ({
        ...prev,
        fps: result.fps || prev.fps,
        totalFrames: Math.max(prev.totalFrames, calculatedFrames),
        endFrame: Math.max(prev.endFrame, calculatedFrames - 1),
      }));

      setCurrentExp((prev) => ({
        ...prev,
        id: uploadSessionId,
        title: 'Stereo: ' + file.name,
        description: `Cam 1 ${result.diagnosticsSummary}`,
        category: 'custom',
      }));

      showToast(
        `Camera 1 ${result.container} Loaded (${calculatedFrames} frames)`,
        `${result.tierDescription} • ${result.width}×${result.height}`
      );
      return;
    } catch {
      setTranscodeProgress(null);
    }

    // Fallback probe for Camera 1
    const url = URL.createObjectURL(file);
    registerBlobUrl(url, 'cam1');
    setVideoUrl(url);
    setIsSynthetic(false);
    const uploadSessionId = 'custom-cam1-' + Date.now();
    mediaDiagnostics.setSession(uploadSessionId, file.name);

    setCurrentExp((prev) => ({
      ...prev,
      id: uploadSessionId,
      title: 'Stereo: ' + file.name,
      description: 'Custom Camera 1 upload',
      category: 'custom',
    }));
  };

  const handleUploadCam2 = async (rawFile: File) => {
    const routed = await ingestWorkstationFile(rawFile);
    if (routed.kind === 'project') {
      await handleOpenProjectFile(rawFile);
      return;
    }

    const file = await resolveUploadedFile(rawFile);
    activeVideoFileCam2Ref.current = file;
    void saveWorkspaceMediaToIndexedDB('cam2', file, file.name);

    if (aviLoaderCam2) {
      aviLoaderCam2.dispose();
      setAviLoaderCam2(null);
    }

    try {
      const result = await loadUniversalVideoFile(file, (percent, statusText) => {
        setTranscodeProgress({ percent, text: `Camera 2: ${statusText}` });
      });
      setTranscodeProgress(null);

      setAviLoaderCam2(result.frameLoader);
      setFormatWarningProbe(null);
      registerBlobUrl(result.videoUrl, 'cam2');
      setVideoUrlCam2(result.videoUrl);
      setIsSynthetic(false);

      const uploadSessionId = 'custom-cam2-' + Date.now();
      mediaDiagnostics.setSession(uploadSessionId, file.name);
      const calculatedFrames = Math.max(10, result.totalFrames || 60);
      setClip((prev) => ({
        ...prev,
        totalFrames: Math.max(prev.totalFrames, calculatedFrames),
        endFrame: Math.max(prev.endFrame, calculatedFrames - 1),
      }));

      setCurrentExp((prev) => ({
        ...prev,
        id: uploadSessionId,
        title: 'Stereo: ' + file.name,
        description: `Cam 2 ${result.diagnosticsSummary}`,
        category: 'custom',
      }));

      showToast(
        `Camera 2 ${result.container} Loaded (${calculatedFrames} frames)`,
        `${result.tierDescription} • ${result.width}×${result.height}`
      );
      return;
    } catch {
      setTranscodeProgress(null);
    }

    const url = URL.createObjectURL(file);
    registerBlobUrl(url, 'cam2');
    setVideoUrlCam2(url);
    setIsSynthetic(false);
    const uploadSessionId = 'custom-cam2-' + Date.now();
    mediaDiagnostics.setSession(uploadSessionId, file.name);

    setCurrentExp((prev) => ({
      ...prev,
      id: uploadSessionId,
      title: 'Stereo: ' + file.name,
      description: 'Custom Camera 2 upload',
      category: 'custom',
    }));
  };

  // ======================== COMPLETE UNDO / REDO HISTORY ENGINE (DEPTH 100) ========================
  interface HistorySnapshot {
    tracks: Track[];
    calibration: Calibration;
    axes: CoordinateAxes;
    triangulation: TriangulationConfig;
    label: string;
  }

  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const historyStateRef = useRef<{
    tracks: Track[];
    calibration: Calibration;
    axes: CoordinateAxes;
    triangulation: TriangulationConfig;
  }>({
    tracks,
    calibration,
    axes,
    triangulation,
  });

  useEffect(() => {
    historyStateRef.current = {
      tracks,
      calibration,
      axes,
      triangulation,
    };
  }, [tracks, calibration, axes, triangulation]);

  const cloneHistorySnapshot = useCallback(
    (label: string): HistorySnapshot => ({
      tracks: JSON.parse(JSON.stringify(historyStateRef.current.tracks)),
      calibration: JSON.parse(JSON.stringify(historyStateRef.current.calibration)),
      axes: JSON.parse(JSON.stringify(historyStateRef.current.axes)),
      triangulation: JSON.parse(JSON.stringify(historyStateRef.current.triangulation)),
      label,
    }),
    []
  );

  const pushHistorySnapshot = useCallback(
    (label = 'Edit Track') => {
      const snapshot = cloneHistorySnapshot(label);
      setUndoStack((prev) => [...prev.slice(-99), snapshot]);
      setRedoStack([]);
    },
    [cloneHistorySnapshot]
  );

  // 3D Point addition from Dual Video Player
  const handleAddPoint3D = (newStep: PointStep) => {
    pushHistorySnapshot(`Mark 3D Stereo Point (F:${newStep.frame})`);
    setTracks((prev) =>
      prev.map((trk) => {
        if (trk.id !== activeTrackId) return trk;

        const filtered = trk.steps.filter((s) => s.frame !== newStep.frame);
        const nextSteps = [...filtered, newStep].sort((a, b) => a.frame - b.frame);
        return {
          ...trk,
          steps: computeKinematics3D(nextSteps, trk.mass),
        };
      })
    );
  };

  // Add / Update Point on Active Track (2D single video)
  const handleAddPoint = (newStep: PointStep) => {
    pushHistorySnapshot(`Mark Point (F:${newStep.frame})`);
    setTracks((prev) =>
      prev.map((trk) => {
        if (trk.id !== activeTrackId) return trk;

        const filtered = trk.steps.filter((s) => s.frame !== newStep.frame);
        const nextSteps = [...filtered, newStep].sort((a, b) => a.frame - b.frame);
        return {
          ...trk,
          steps: computeKinematics(nextSteps, trk.mass),
        };
      })
    );
  };

  const handleUpdatePoint = (frame: number, px: number, py: number) => {
    setTracks((prev) =>
      prev.map((trk) => {
        if (trk.id !== activeTrackId) return trk;

        const nextSteps = trk.steps.map((s) => {
          if (s.frame !== frame) return s;
          const world = pixelToWorld(px, py, axes, calibration);
          return {
            ...s,
            px,
            py,
            x: world.x,
            y: world.y,
          };
        });

        return {
          ...trk,
          steps: computeKinematics(nextSteps, trk.mass),
        };
      })
    );
  };

  // Sub-pixel Point Nudge (Alt+ArrowKeys or ArrowUp/Down or Transport Bar Nudge Buttons)
  const handleNudgeCurrentPoint = useCallback(
    (dpx: number, dpy: number, targetCam: 1 | 2 = 1) => {
      const activeTrack = historyStateRef.current.tracks.find((t) => t.id === activeTrackId);
      const existingStep = activeTrack?.steps.find((s) => s.frame === currentFrame);
      if (!existingStep) return;

      pushHistorySnapshot(`Nudge Point (F:${currentFrame})`);

      setTracks((prev) =>
        prev.map((trk) => {
          if (trk.id !== activeTrackId) return trk;

          const nextSteps = trk.steps.map((s) => {
            if (s.frame !== currentFrame) return s;

            if (analysisMode === '3D') {
              const c1x =
                targetCam === 1
                  ? Number(((s.cam1Px ?? s.px) + dpx).toFixed(2))
                  : s.cam1Px ?? s.px;
              const c1y =
                targetCam === 1
                  ? Number(((s.cam1Py ?? s.py) + dpy).toFixed(2))
                  : s.cam1Py ?? s.py;
              const c2x =
                targetCam === 2 && s.cam2Px !== undefined
                  ? Number((s.cam2Px + dpx).toFixed(2))
                  : s.cam2Px;
              const c2y =
                targetCam === 2 && s.cam2Py !== undefined
                  ? Number((s.cam2Py + dpy).toFixed(2))
                  : s.cam2Py;

              if (c2x !== undefined && c2y !== undefined) {
                const { dltCam1, dltCam2 } = buildDefaultDLT(
                  triangulation.method,
                  triangulation.pixelsPerMeterCam1,
                  triangulation.pixelsPerMeterCam2,
                  triangulation.originCam1,
                  triangulation.originCam2,
                  triangulation.baselineMeters,
                  triangulation.convergenceAngleDeg
                );
                const dlt1 = triangulation.dltCam1 || dltCam1;
                const dlt2 = triangulation.dltCam2 || dltCam2;
                const tri = triangulateDLT(c1x, c1y, dlt1, c2x, c2y, dlt2);
                if (tri) {
                  return {
                    ...s,
                    px: c1x,
                    py: c1y,
                    cam1: { px: c1x, py: c1y },
                    cam2: { px: c2x, py: c2y },
                    cam1Px: c1x,
                    cam1Py: c1y,
                    cam2Px: c2x,
                    cam2Py: c2y,
                    x: tri.x,
                    y: tri.y,
                    z: tri.z,
                    residual: tri.residual,
                    triangulationResidual: tri.residual,
                  };
                }
              }

              const worldFallback = pixelToWorld(c1x, c1y, axes, calibration);
              return {
                ...s,
                px: c1x,
                py: c1y,
                cam1: { px: c1x, py: c1y },
                cam1Px: c1x,
                cam1Py: c1y,
                x: worldFallback.x,
                y: worldFallback.y,
              };
            }

            const nextPx = Number((s.px + dpx).toFixed(2));
            const nextPy = Number((s.py + dpy).toFixed(2));
            const world = pixelToWorld(nextPx, nextPy, axes, calibration);
            return {
              ...s,
              px: nextPx,
              py: nextPy,
              x: world.x,
              y: world.y,
            };
          });

          return {
            ...trk,
            steps:
              analysisMode === '3D'
                ? computeKinematics3D(nextSteps, trk.mass)
                : computeKinematics(nextSteps, trk.mass),
          };
        })
      );
    },
    [activeTrackId, currentFrame, analysisMode, triangulation, axes, calibration, pushHistorySnapshot]
  );

  const handleDeletePoint = (frame: number) => {
    const activeTrack = historyStateRef.current.tracks.find((t) => t.id === activeTrackId);
    if (!activeTrack?.steps.some((s) => s.frame === frame)) return;

    pushHistorySnapshot(`Delete Point (F:${frame})`);
    setTracks((prev) =>
      prev.map((trk) => {
        if (trk.id !== activeTrackId) return trk;
        const filtered = trk.steps.filter((s) => s.frame !== frame);
        return {
          ...trk,
          steps: analysisMode === '3D' ? computeKinematics3D(filtered, trk.mass) : computeKinematics(filtered, trk.mass),
        };
      })
    );
  };

  const handleUndoLastPoint = useCallback(() => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length > 0) {
        const previousSnapshot = prevUndo[prevUndo.length - 1];
        const currentSnapshot = cloneHistorySnapshot(previousSnapshot.label);
        setRedoStack((prevRedo) => [...prevRedo.slice(-99), currentSnapshot]);
        setTracks(previousSnapshot.tracks);
        setCalibration(previousSnapshot.calibration);
        setAxes(previousSnapshot.axes);
        setTriangulation(previousSnapshot.triangulation);
        return prevUndo.slice(0, -1);
      }

      // Fallback when undoStack is empty on initial sample points: pop last point and push to redoStack
      const activeTrack = historyStateRef.current.tracks.find((t) => t.id === activeTrackId);
      if (activeTrack && activeTrack.steps.length > 0) {
        const currentSnapshot = cloneHistorySnapshot('Remove Last Point');
        setRedoStack((prevRedo) => [...prevRedo.slice(-99), currentSnapshot]);
        setTracks((prevTracks) =>
          prevTracks.map((trk) => {
            if (trk.id !== activeTrackId || trk.steps.length === 0) return trk;
            const hasCur = trk.steps.some((s) => s.frame === currentFrame);
            const filtered = hasCur
              ? trk.steps.filter((s) => s.frame !== currentFrame)
              : trk.steps.slice(0, -1);
            return {
              ...trk,
              steps:
                analysisMode === '3D'
                  ? computeKinematics3D(filtered, trk.mass)
                  : computeKinematics(filtered, trk.mass),
            };
          })
        );
      }
      return prevUndo;
    });
  }, [activeTrackId, analysisMode, cloneHistorySnapshot, currentFrame]);

  const handleRedoLastPoint = useCallback(() => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextSnapshot = prevRedo[prevRedo.length - 1];
      const currentSnapshot = cloneHistorySnapshot(nextSnapshot.label);
      setUndoStack((prevUndo) => [...prevUndo.slice(-99), currentSnapshot]);
      setTracks(nextSnapshot.tracks);
      setCalibration(nextSnapshot.calibration);
      setAxes(nextSnapshot.axes);
      setTriangulation(nextSnapshot.triangulation);
      return prevRedo.slice(0, -1);
    });
  }, [cloneHistorySnapshot]);

  // Helper to build current canonical SavedProjectData snapshot
  const buildCurrentProjectSnapshot = useCallback(() => {
    return serializeProject({
      analysisMode,
      experimentTitle: currentExp.title,
      currentExpId: currentExp.id,
      activeTrackId,
      currentFrame,
      isSynthetic,
      syntheticType: currentExp.syntheticType,
      videoUrl,
      videoUrlCam2,
      videoNameCam1: activeVideoFileCam1Ref.current?.name || currentExp.title,
      videoNameCam2: activeVideoFileCam2Ref.current?.name,
      videoFileCam1: activeVideoFileCam1Ref.current,
      videoFileCam2: activeVideoFileCam2Ref.current,
      triangulation,
      calibration,
      axes,
      clip,
      tracks,
      graphConfig,
    });
  }, [
    analysisMode,
    currentExp,
    activeTrackId,
    currentFrame,
    isSynthetic,
    videoUrl,
    videoUrlCam2,
    triangulation,
    calibration,
    axes,
    clip,
    tracks,
    graphConfig,
  ]);

  // Requirement 7 & 9: Export & Save Project (.trk JSON & LocalStorage + IndexedDB)
  const handleExportJSON = useCallback(() => {
    const projectData = buildCurrentProjectSnapshot();

    saveSessionToLocalStorage(projectData, true);
    void saveWorkspaceToIndexedDB(projectData, true);

    const safeTitle = (currentExp.title || currentExp.id || 'tracker_project')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = safeTitle.toLowerCase().endsWith('.trk') ? safeTitle : `${safeTitle}.trk`;
    const trkString = serializeProjectToTrk({
      analysisMode,
      experimentTitle: currentExp.title,
      currentExpId: currentExp.id,
      activeTrackId,
      currentFrame,
      isSynthetic,
      syntheticType: currentExp.syntheticType,
      videoUrl,
      videoUrlCam2,
      videoNameCam1: activeVideoFileCam1Ref.current?.name || currentExp.title,
      videoNameCam2: activeVideoFileCam2Ref.current?.name,
      videoFileCam1: activeVideoFileCam1Ref.current,
      videoFileCam2: activeVideoFileCam2Ref.current,
      triangulation,
      calibration,
      axes,
      clip,
      tracks,
      graphConfig,
    });
    const blob = new Blob([trkString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    const totalPts = tracks.reduce((acc, t) => acc + t.steps.length, 0);
    showToast(
      'Project Saved Successfully (Ctrl+S)',
      `${totalPts} points recorded • ${filename} saved & preserved in workstation storage`
    );
  }, [
    analysisMode,
    axes,
    buildCurrentProjectSnapshot,
    calibration,
    clip,
    currentExp,
    currentFrame,
    graphConfig,
    isSynthetic,
    showToast,
    activeTrackId,
    tracks,
    triangulation,
    videoUrl,
    videoUrlCam2,
  ]);

  // Requirement 7 & 9: Save Project to Local Folder or Self-Contained ZIP Bundle (including video)
  const handleSaveToFolder = useCallback(async () => {
    try {
      const result = await saveProjectToFolderOrBundle({
        analysisMode,
        experimentTitle: currentExp.title,
        currentExpId: currentExp.id,
        activeTrackId,
        currentFrame,
        isSynthetic,
        syntheticType: currentExp.syntheticType,
        videoUrl,
        videoUrlCam2,
        videoNameCam1: activeVideoFileCam1Ref.current?.name || currentExp.title,
        videoNameCam2: activeVideoFileCam2Ref.current?.name,
        videoFileCam1: activeVideoFileCam1Ref.current,
        videoFileCam2: activeVideoFileCam2Ref.current,
        triangulation,
        calibration,
        axes,
        clip,
        tracks,
        graphConfig,
      });

      const totalPts = tracks.reduce((acc, t) => acc + t.steps.length, 0);
      showToast(
        result.savedAsFolder ? 'Project Folder Saved' : 'Project ZIP Bundle Saved',
        `${result.filesWritten.join(', ')} • ${totalPts} points preserved`
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      showToast('Save Folder Notice', err?.message || 'Could not complete folder save.');
    }
  }, [
    analysisMode,
    currentExp,
    activeTrackId,
    currentFrame,
    isSynthetic,
    videoUrl,
    videoUrlCam2,
    triangulation,
    calibration,
    axes,
    clip,
    tracks,
    graphConfig,
    showToast,
  ]);

  // Restore decoded video File into Camera 1 or Camera 2 without wiping restored project tracks/clip
  const restoreVideoFileToSlot = useCallback(
    async (file: File, slot: 'cam1' | 'cam2', restoredClip?: ClipSettings) => {
      try {
        const result = await loadUniversalVideoFile(file);
        if (slot === 'cam1') {
          activeVideoFileCam1Ref.current = file;
          setAviLoader((prev) => {
            if (prev) prev.dispose();
            return result.frameLoader;
          });
          registerBlobUrl(result.videoUrl, 'cam1');
          setVideoUrl(result.videoUrl);
          setIsSynthetic(false);
          if (!restoredClip) {
            const fpsVal = Math.max(1, Math.round(result.fps || 30));
            const totalFramesVal = Math.max(1, result.totalFrames || 60);
            setClip((prev) => ({
              ...prev,
              fps: fpsVal,
              totalFrames: totalFramesVal,
              endFrame: Math.max(prev.endFrame, totalFramesVal - 1),
            }));
          }
        } else {
          activeVideoFileCam2Ref.current = file;
          setAviLoaderCam2((prev) => {
            if (prev) prev.dispose();
            return result.frameLoader;
          });
          registerBlobUrl(result.videoUrl, 'cam2');
          setVideoUrlCam2(result.videoUrl);
          setIsSynthetic(false);
        }
      } catch {
        const fallbackUrl = URL.createObjectURL(file);
        registerBlobUrl(fallbackUrl, slot);
        if (slot === 'cam1') {
          activeVideoFileCam1Ref.current = file;
          setVideoUrl(fallbackUrl);
          setIsSynthetic(false);
        } else {
          activeVideoFileCam2Ref.current = file;
          setVideoUrlCam2(fallbackUrl);
          setIsSynthetic(false);
        }
      }
    },
    [registerBlobUrl]
  );

  // Unified Project State Restoration (used by Open Project .trk/.zip/.json and IndexedDB session recovery)
  const applyRestoredProjectData = useCallback(
    async (
      data: NonNullable<ReturnType<typeof validateAndParseProject>['data']>,
      bundledVideoCam1?: File,
      bundledVideoCam2?: File,
      sourceLabel = 'Project'
    ) => {
      // 1. Restore Analysis Mode ('2D', '3D', or '6DOF') & Layout
      if (
        data.analysisMode === '2D' ||
        data.analysisMode === '3D' ||
        data.analysisMode === '6DOF'
      ) {
        setAnalysisMode(data.analysisMode);
        if (data.analysisMode === '3D') {
          setLayout('split-3d');
        } else if (layout === 'split-3d' || layout === 'trajectory-3d') {
          setLayout('split');
        }
      }

      // 2. Restore Tracks & Active Track ID
      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        setTracks(data.tracks);
        const targetTrackId =
          data.activeTrackId && data.tracks.some((t) => t.id === data.activeTrackId)
            ? data.activeTrackId
            : data.tracks[0].id;
        setActiveTrackId(targetTrackId);
      }

      // 3. Restore Calibration, Axes, Triangulation, Clip, and Current Frame
      if (data.triangulation) setTriangulation(data.triangulation);
      if (data.calibration) setCalibration(data.calibration);
      if (data.axes) setAxes(data.axes);
      if (data.clip) {
        setClip(data.clip);
        const targetFrame =
          data.currentFrame !== undefined
            ? Math.max(data.clip.startFrame, Math.min(data.clip.endFrame, data.currentFrame))
            : data.clip.startFrame;
        setCurrentFrame(targetFrame);
      }

      // 4. Restore Graph Configuration
      if (data.graphConfig) {
        const restoredGraph = { ...DEFAULT_GRAPH_CONFIG, ...data.graphConfig };
        setGraphConfig(restoredGraph);
        try {
          localStorage.setItem('tracker_graph_config_v2', JSON.stringify(restoredGraph));
        } catch {
          // ignore
        }
      }

      // 5. Restore Experiment Metadata & Video Streams (Sample / Bundled / IndexedDB Cache)
      const matchedSample = SAMPLE_EXPERIMENTS.find((s) => s.id === data.currentExpId);
      if (bundledVideoCam1) {
        setPendingRelinkVideoName(null);
        void saveWorkspaceMediaToIndexedDB('cam1', bundledVideoCam1, data.currentExpId);
        await restoreVideoFileToSlot(bundledVideoCam1, 'cam1', data.clip);
      } else if (matchedSample) {
        setPendingRelinkVideoName(null);
        if (aviLoader) {
          aviLoader.dispose();
          setAviLoader(null);
        }
        setVideoUrl(matchedSample.videoUrl);
        setVideoUrlCam2(matchedSample.videoUrlCam2 || '');
        setIsSynthetic(Boolean(matchedSample.syntheticType));
      } else if (data.camera1?.videoUrl && !data.camera1.videoUrl.startsWith('blob:')) {
        setPendingRelinkVideoName(null);
        setVideoUrl(data.camera1.videoUrl);
        setIsSynthetic(Boolean(data.isSynthetic));
      } else {
        // Attempt to relink cached local video from IndexedDB via metadata or slot fallback
        const cachedCam1File = await findCachedVideoForProject(
          data.videoMetadata,
          data.camera1?.videoName,
          'cam1'
        );
        if (cachedCam1File) {
          setPendingRelinkVideoName(null);
          await restoreVideoFileToSlot(cachedCam1File, 'cam1', data.clip);
        } else {
          // Keep synthetic telemetry canvas active so trajectories, vectors & graphs render cleanly
          setIsSynthetic(true);
          const relinkName =
            data.videoMetadata?.fileName ||
            data.camera1?.videoName ||
            (data.isSynthetic ? null : data.experimentTitle || 'source_video.mp4');
          setPendingRelinkVideoName(data.isSynthetic ? null : relinkName);
        }
      }

      if (bundledVideoCam2) {
        void saveWorkspaceMediaToIndexedDB('cam2', bundledVideoCam2, data.currentExpId);
        await restoreVideoFileToSlot(bundledVideoCam2, 'cam2', data.camera2?.clip);
      } else if (data.analysisMode === '3D' && !matchedSample) {
        const cachedCam2File = await findCachedVideoForProject(
          undefined,
          data.camera2?.videoName,
          'cam2'
        );
        if (cachedCam2File) {
          await restoreVideoFileToSlot(cachedCam2File, 'cam2', data.camera2?.clip);
        }
      }

      setCurrentExp((prev) => ({
        ...prev,
        id: data.currentExpId || prev.id,
        title: data.experimentTitle || prev.title,
        syntheticType:
          matchedSample?.syntheticType ??
          data.syntheticType ??
          prev.syntheticType ??
          'projectile',
        is3D: data.analysisMode === '3D',
        calibration: data.calibration || prev.calibration,
        axes: data.axes || prev.axes,
        clip: data.clip || prev.clip,
        triangulation: data.triangulation || prev.triangulation,
      }));

      // Persist restored project into LocalStorage & IndexedDB
      saveSessionToLocalStorage(data, true);
      void saveWorkspaceToIndexedDB(data, true);

      const modeDisplay = data.analysisMode === '6DOF' ? '6-DOF' : data.analysisMode || '2D';
      const trackCount = (data.tracks || []).length;
      const ptCount = (data.tracks || []).reduce(
        (acc: number, t: any) => acc + (t.steps?.length || 0),
        0
      );
      const frameCount = data.clip?.totalFrames || Math.max(ptCount, 1);
      showToast(
        `Restored Project: ${data.experimentTitle || sourceLabel} | Mode: ${modeDisplay} | ${trackCount} Tracks | ${frameCount} Frames`,
        `${ptCount} telemetry steps restored • Active Track: ${data.activeTrackId || data.tracks?.[0]?.id || 'track-1'}`
      );
    },
    [aviLoader, layout, restoreVideoFileToSlot, showToast]
  );

  // Requirement 7 & 9: Open & Restore Saved Project (.trk / .json / .zip / .trz) via Magic-Byte Router
  const handleOpenProjectFile = useCallback(
    async (file: File) => {
      try {
        const routed = await ingestWorkstationFile(file);
        if (routed.kind === 'video') {
          await handleUploadVideo(file, false);
          return;
        }
        if (!routed.valid || !routed.data) {
          showToast(
            'Invalid Project File',
            routed.error ||
              routed.errors?.join('; ') ||
              'Could not parse .trk / .zip project file'
          );
          return;
        }
        await applyRestoredProjectData(
          routed.data,
          routed.videoFileCam1,
          routed.videoFileCam2,
          file.name
        );
      } catch (err: any) {
        showToast(
          'Error Reading Project File',
          err?.message || 'Could not parse project file format.'
        );
      }
    },
    [applyRestoredProjectData, showToast]
  );

  // Reset / Clear Saved Session back to default benchmark experiment
  const handleResetWorkspace = useCallback(async () => {
    await clearSavedWorkspaceSession();
    activeVideoFileCam1Ref.current = null;
    activeVideoFileCam2Ref.current = null;
    setPendingRelinkVideoName(null);
    handleSelectExperiment(SAMPLE_EXPERIMENTS[0]);
    showToast(
      'Workspace Reset to Default',
      'Cleared auto-saved session and restored benchmark scenario'
    );
  }, [showToast]);

  // On initial mount: restore any cached custom video or newer IndexedDB project state,
  // then unlock isHydratedRef so auto-save never overwrites saved work during startup.
  const hasRestoredMountRef = useRef(false);
  useEffect(() => {
    if (hasRestoredMountRef.current) return;
    hasRestoredMountRef.current = true;

    void (async () => {
      try {
        const idbSession = await loadWorkspaceFromIndexedDB();
        const activeSession = idbSession || initialSession;
        if (activeSession) {
          // If IndexedDB had a newer session than LocalStorage (e.g. large track), apply its tracks/state
          if (
            idbSession &&
            (!initialSession ||
              new Date(idbSession.timestamp).getTime() >
                new Date(initialSession.timestamp).getTime())
          ) {
            await applyRestoredProjectData(idbSession, undefined, undefined, 'Auto-Saved Session');
            return;
          }

          // If the restored session was using a custom uploaded video, reload the video binary from IndexedDB
          const isBuiltInSample = SAMPLE_EXPERIMENTS.some(
            (s) => s.id === activeSession.currentExpId
          );
          if (!isBuiltInSample) {
            const cachedCam1File = await findCachedVideoForProject(
              activeSession.videoMetadata,
              activeSession.camera1?.videoName,
              'cam1'
            );
            if (cachedCam1File) {
              setPendingRelinkVideoName(null);
              await restoreVideoFileToSlot(cachedCam1File, 'cam1', activeSession.clip);
            } else if (!activeSession.isSynthetic) {
              setIsSynthetic(true);
              setPendingRelinkVideoName(
                activeSession.videoMetadata?.fileName ||
                  activeSession.camera1?.videoName ||
                  activeSession.experimentTitle ||
                  null
              );
            }
            if (activeSession.analysisMode === '3D') {
              const cachedCam2File = await findCachedVideoForProject(
                undefined,
                activeSession.camera2?.videoName,
                'cam2'
              );
              if (cachedCam2File) {
                await restoreVideoFileToSlot(
                  cachedCam2File,
                  'cam2',
                  activeSession.camera2?.clip
                );
              }
            }
          }
        }
      } catch (err) {
        console.warn('Session restoration notice:', err);
      } finally {
        isHydratedRef.current = true;
        setIsRestoringSession(false);
      }
    })();
  }, [applyRestoredProjectData, initialSession, restoreVideoFileToSlot]);

  // Auto-save session debounced (400ms) — strictly guarded by isHydratedRef & isRestoringSession
  useEffect(() => {
    if (!isHydratedRef.current || isRestoringSession) return;
    const timer = setTimeout(() => {
      if (!isHydratedRef.current) return;
      const snapshot = buildCurrentProjectSnapshot();
      saveSessionToLocalStorage(snapshot, isHydratedRef.current);
      void saveWorkspaceToIndexedDB(snapshot, isHydratedRef.current);
    }, 400);
    return () => clearTimeout(timer);
  }, [buildCurrentProjectSnapshot, isRestoringSession]);

  // Immediate synchronous flush on beforeunload, pagehide, and visibilitychange (hidden)
  useEffect(() => {
    const flushSessionOnUnload = () => {
      if (!isHydratedRef.current) return;
      const snapshot = buildCurrentProjectSnapshot();
      saveSessionToLocalStorage(snapshot, isHydratedRef.current);
      void saveWorkspaceToIndexedDB(snapshot, isHydratedRef.current);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSessionOnUnload();
      }
    };
    window.addEventListener('beforeunload', flushSessionOnUnload);
    window.addEventListener('pagehide', flushSessionOnUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushSessionOnUnload);
      window.removeEventListener('pagehide', flushSessionOnUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [buildCurrentProjectSnapshot]);

  // Keyboard shortcut listener for Tracker-style efficiency (Frame nav, Undo, Delete, Tool toggles, Save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form inputs, textareas, or selects
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Save Project (Ctrl+S or Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleExportJSON();
        return;
      }

      // 1. Sub-pixel Point Nudge (Alt + ArrowKeys or ArrowUp/ArrowDown on current frame point)
      if (
        (e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) ||
        (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))
      ) {
        const activeTrk = tracks.find((t) => t.id === activeTrackId);
        if (activeTrk?.steps.some((s) => s.frame === currentFrame)) {
          e.preventDefault();
          const delta = e.shiftKey ? 0.1 : 0.5;
          if (e.key === 'ArrowLeft') handleNudgeCurrentPoint(-delta, 0);
          else if (e.key === 'ArrowRight') handleNudgeCurrentPoint(delta, 0);
          else if (e.key === 'ArrowUp') handleNudgeCurrentPoint(0, -delta);
          else if (e.key === 'ArrowDown') handleNudgeCurrentPoint(0, delta);
          return;
        }
      }

      // 1b. Frame-by-frame navigation
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? clip.stepSize * 5 : clip.stepSize;
        setCurrentFrame((curr) => Math.min(clip.endFrame, curr + step));
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? clip.stepSize * 5 : clip.stepSize;
        setCurrentFrame((curr) => Math.max(clip.startFrame, curr - step));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setCurrentFrame(clip.startFrame);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setCurrentFrame(clip.endFrame);
        return;
      }

      // 2. Undo, Redo & Point Management (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        handleRedoLastPoint();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoLastPoint();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        handleClearTrackPoints();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeletePoint(currentFrame);
        return;
      }

      // 3. Tab to cycle tracks
      if (e.key === 'Tab' && tracks.length > 1) {
        e.preventDefault();
        const trackIdx = tracks.findIndex((t) => t.id === activeTrackId);
        if (trackIdx !== -1) {
          const nextIdx = e.shiftKey
            ? (trackIdx - 1 + tracks.length) % tracks.length
            : (trackIdx + 1) % tracks.length;
          setActiveTrackId(tracks[nextIdx].id);
        }
        return;
      }

      // 4. Keyboard Shortcuts Modal toggle (? or F1)
      if (e.key === '?' || (e.shiftKey && e.key === '/') || e.key === 'F1') {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
        return;
      }

      // 4b. Metrology Error & Accuracy Audit Modal toggle (Alt+M)
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsMetrologyAuditOpen((prev) => !prev);
        return;
      }

      // 5. Tools & Overlays toggles + Workflow Focus Presets (single-key shortcuts without Ctrl/Cmd/Alt)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'm') {
          e.preventDefault();
          setShowLoupe((prev) => !prev);
        } else if (key === 'a') {
          e.preventDefault();
          setAxes((prev) => ({ ...prev, visible: !prev.visible }));
        } else if (key === 'c') {
          e.preventDefault();
          setCalibration((prev) => ({ ...prev, visible: !prev.visible }));
        } else if (key === 'v') {
          e.preventDefault();
          setShowVectors((prev) => !prev);
        } else if (key === 't') {
          e.preventDefault();
          setShowTrails((prev) => !prev);
        } else if (key === '1') {
          e.preventDefault();
          handleLayoutChange('video-only');
        } else if (key === '2') {
          e.preventDefault();
          handleLayoutChange('video-plot');
        } else if (key === '3') {
          e.preventDefault();
          handleLayoutChange('split');
        } else if (key === '4') {
          e.preventDefault();
          handleLayoutChange('split-3d');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentFrame,
    activeTrackId,
    analysisMode,
    clip.startFrame,
    clip.endFrame,
    clip.stepSize,
    tracks,
    handleExportJSON,
    handleLayoutChange,
    handleUndoLastPoint,
    handleRedoLastPoint,
    handleNudgeCurrentPoint,
  ]);

  const handleClearTrackPoints = () => {
    const activeTrack = historyStateRef.current.tracks.find((t) => t.id === activeTrackId);
    if (!activeTrack || activeTrack.steps.length === 0) return;

    pushHistorySnapshot('Clear Track Points');
    setTracks((prev) =>
      prev.map((trk) => (trk.id === activeTrackId ? { ...trk, steps: [] } : trk))
    );
  };

  // Calibration updates (2D)
  const handleUpdateCalibration = (updates: Partial<Calibration>) => {
    const updated = { ...calibration, ...updates };
    setCalibration(updated);
    setTracks((prev) => refreshAllTrackKinematics(prev, axes, updated));
  };

  // Axes updates (2D)
  const handleUpdateAxes = (updates: Partial<CoordinateAxes>) => {
    const updated = { ...axes, ...updates };
    setAxes(updated);
    setTracks((prev) => refreshAllTrackKinematics(prev, updated, calibration));
  };

  // 3D Triangulation Calibration updates
  const handleSaveTriangulation = (updatedConfig: TriangulationConfig) => {
    pushHistorySnapshot('Update 3D Stereo Calibration');
    setTriangulation(updatedConfig);

    // Re-triangulate all existing steps with new calibration parameters
    const { dltCam1, dltCam2 } = buildDefaultDLT(
      updatedConfig.method,
      updatedConfig.pixelsPerMeterCam1,
      updatedConfig.pixelsPerMeterCam2,
      updatedConfig.originCam1,
      updatedConfig.originCam2,
      updatedConfig.baselineMeters,
      updatedConfig.convergenceAngleDeg
    );

    const dlt1 = updatedConfig.dltCam1 || dltCam1;
    const dlt2 = updatedConfig.dltCam2 || dltCam2;

    setTracks((prev) =>
      prev.map((trk) => {
        const recomputedSteps = trk.steps.map((step) => {
          if (
            step.cam1Px !== undefined &&
            step.cam1Py !== undefined &&
            step.cam2Px !== undefined &&
            step.cam2Py !== undefined
          ) {
            const tri = triangulateDLT(
              step.cam1Px,
              step.cam1Py,
              dlt1,
              step.cam2Px,
              step.cam2Py,
              dlt2
            );
            if (tri) {
              const err3D =
                step.referenceX != null && step.referenceY != null && step.referenceZ != null
                  ? Math.hypot(tri.x - step.referenceX, tri.y - step.referenceY, tri.z - step.referenceZ)
                  : null;
              return {
                ...step,
                x: tri.x,
                y: tri.y,
                z: tri.z,
                residual: tri.residual,
                triangulationResidual: tri.residual,
                reconstructionError3D: err3D,
              };
            }
          }
          return step;
        });

        return {
          ...trk,
          steps: computeKinematics3D(recomputedSteps, trk.mass),
        };
      })
    );
  };

  // Track management
  const handleAddTrack = (name: string, color: string, mass: number) => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name,
      color,
      mass,
      footprint: 'circle',
      steps: [],
      visible: true,
      showVectors: true,
      showTrails: true,
      showLabels: true,
    };
    setTracks((prev) => [...prev, newTrack]);
    setActiveTrackId(newTrack.id);
  };

  const handleUpdateTrack = (trackId: string, updates: Partial<Track>) => {
    setTracks((prev) =>
      prev.map((trk) => {
        if (trk.id !== trackId) return trk;
        const updated = { ...trk, ...updates };
        if (updates.mass !== undefined) {
          updated.steps = analysisMode === '3D'
            ? computeKinematics3D(updated.steps, updated.mass)
            : computeKinematics(updated.steps, updated.mass);
        }
        return updated;
      })
    );
  };

  const handleDeleteTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    setTracks((prev) => {
      const remaining = prev.filter((t) => t.id !== trackId);
      if (activeTrackId === trackId) {
        setActiveTrackId(remaining[0].id);
      }
      return remaining;
    });
  };

  // Export CSV (Certified Defense Telemetry & Range Safety Metrology Header)
  const handleExportCSV = () => {
    const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
    if (!activeTrack || activeTrack.steps.length === 0) return;

    const csvStr = buildCertifiedDefenseTelemetryCSV(
      activeTrack,
      clip,
      analysisMode,
      graphConfig,
      'defense',
      's'
    );

    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTrack.name}_certified_defense_telemetry.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeTrackObj = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const currentStepObj = activeTrackObj?.steps.find((s) => s.frame === currentFrame);
  const canUndo = undoStack.length > 0 || (activeTrackObj?.steps.length ?? 0) > 0;
  const canRedo = redoStack.length > 0;

  const normMetrologyMode: '2d' | '3d_stereo' | '6dof' =
    analysisMode === '3D' ? '3d_stereo' : analysisMode === '6DOF' ? '6dof' : '2d';

  const activeAuditReports = React.useMemo(() => {
    const raw = activeTrackObj?.steps || [];
    const { panel1ErrorReport, panel2ErrorReport } = deriveSixChannelSeries(
      raw,
      graphConfig,
      (graphConfig.varX || 't') === 't',
      { analysisMode: normMetrologyMode, fps: clip.fps }
    );
    return { panel1ErrorReport, panel2ErrorReport };
  }, [activeTrackObj, graphConfig, normMetrologyMode, clip.fps]);

  // Reusable 24px Panel Header Bar with Maximize / Restore, Collapse, and Quick Swap
  const renderPanelHeader = (
    panelId: 'video' | '3d' | 'graph' | 'table',
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    onCollapse?: () => void
  ) => {
    const isMax = maximizedPanel === panelId;
    return (
      <div className="h-[24px] bg-[#E2E8F0] border-b border-[#CBD5E1] px-2.5 flex items-center justify-between text-[11px] select-none shrink-0">
        <div className="flex items-center gap-1.5 font-bold text-[#1E293B] truncate">
          <span className="text-[#2563EB] shrink-0">{icon}</span>
          <span>{title}</span>
          {subtitle && (
            <span className="font-mono text-[10px] font-normal text-[#64748B] ml-1 truncate">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsPanesSwapped((prev) => !prev)}
            className="h-[18px] px-1.5 rounded-[2px] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155] flex items-center gap-0.5 text-[10px] font-semibold cursor-pointer"
            title="Quick Swap Left & Right Workspace Panes"
          >
            <ArrowLeftRight className="w-2.5 h-2.5 text-[#2563EB]" />
            <span className="hidden sm:inline">Swap</span>
          </button>
          {onCollapse && !isMax && (
            <button
              type="button"
              onClick={onCollapse}
              className="h-[18px] px-1 rounded-[2px] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155] flex items-center gap-0.5 text-[10px] font-semibold cursor-pointer"
              title="Collapse Panel to Status Tab"
            >
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
          )}
          <button
            id={`btn-maximize-panel-${panelId}`}
            type="button"
            onClick={() => setMaximizedPanel(isMax ? 'none' : panelId)}
            className={`h-[18px] px-1.5 rounded-[2px] border flex items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
              isMax
                ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                : 'bg-white hover:bg-[#F8FAFC] text-[#1E293B] border-[#CBD5E1]'
            }`}
            title={isMax ? 'Restore Split-Pane Workspace' : `Maximize ${title} to Full Screen`}
          >
            {isMax ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
            <span>{isMax ? 'Restore' : 'Max'}</span>
          </button>
        </div>
      </div>
    );
  };

  // Render Video Feed Content (Single Camera 2D/6DOF or Dual Camera 3D Stereo)
  const renderVideoFeedContent = () => (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {pendingRelinkVideoName && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1 bg-[#1E293B] text-[#F8FAFC] border-b border-[#334155] text-[11px] font-mono shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B] shrink-0" />
            <span className="truncate">
              Project telemetry restored ({pendingRelinkVideoName}).
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={relinkInputRef}
              type="file"
              accept=".mp4,.avi,.wmv,.flv,.mov,.mkv,.webm,.mpg,.mpeg,.m4v,video/mp4,video/x-msvideo,video/x-ms-wmv,video/x-flv,video/quicktime,video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleUploadVideo(file, true);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => relinkInputRef.current?.click()}
              className="px-2 py-0.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-[2px] border border-[#1E40AF] text-[10px] cursor-pointer"
            >
              [Relink Video File]
            </button>
            <button
              type="button"
              onClick={() => setPendingRelinkVideoName(null)}
              className="px-1.5 py-0.5 bg-[#334155] hover:bg-[#475569] text-slate-200 rounded-[2px] text-[10px] cursor-pointer"
              title="Dismiss relink banner and continue on synthetic telemetry canvas"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {analysisMode === '3D' ? (
          <DualVideoPlayerView
            tracks={tracks}
            activeTrackId={activeTrackId}
            onAddPoint3D={handleAddPoint3D}
            onDeletePoint={handleDeletePoint}
            clip={clip}
            onUpdateClip={(updates) => setClip((prev) => ({ ...prev, ...updates }))}
            triangulation={triangulation}
            onUpdateTriangulation={(updates) => handleSaveTriangulation({ ...triangulation, ...updates })}
            currentFrame={currentFrame}
            onFrameChange={setCurrentFrame}
            videoUrlCam1={videoUrl}
            videoUrlCam2={videoUrlCam2}
            aviLoaderCam1={aviLoader}
            aviLoaderCam2={aviLoaderCam2}
            onUploadCam1={handleUploadCam1}
            onUploadCam2={handleUploadCam2}
            showTrails={showTrails}
            showVectors={showVectors}
            showLoupe={showLoupe}
            autoAdvance={autoAdvance}
            requireShiftToMark={requireShiftToMark}
            onUndoLastPoint={handleUndoLastPoint}
            onRedoLastPoint={handleRedoLastPoint}
            canUndo={canUndo}
            canRedo={canRedo}
            onBeginHistoryAction={pushHistorySnapshot}
            onOpenFormatsModal={handleOpenFormatsModal}
            onOpenTriangulationModal={() => setIsTriModalOpen(true)}
            calibration={calibration}
            onRegisterSnapshotGetter={(getter) => {
              snapshotGetterRef.current = getter;
            }}
          />
        ) : (
          <VideoPlayerView
            videoUrl={videoUrl}
            aviLoader={aviLoader}
            isSynthetic={isSynthetic}
            syntheticType={currentExp.syntheticType || currentExp.id}
            fileName={currentExp.title}
            onUploadVideo={handleUploadVideo}
            onOpenFormatsModal={handleOpenFormatsModal}
            tracks={tracks}
            activeTrackId={activeTrackId}
            onAddPoint={handleAddPoint}
            onUpdatePoint={handleUpdatePoint}
            onDeleteCurrentPoint={handleDeletePoint}
            calibration={calibration}
            onUpdateCalibration={handleUpdateCalibration}
            axes={axes}
            onUpdateAxes={handleUpdateAxes}
            clip={clip}
            onUpdateClip={(updates) => setClip((prev) => ({ ...prev, ...updates }))}
            currentFrame={currentFrame}
            onFrameChange={setCurrentFrame}
            showTrails={showTrails}
            showVectors={showVectors}
            showLoupe={showLoupe}
            autoAdvance={autoAdvance}
            requireShiftToMark={requireShiftToMark}
            onUndoLastPoint={handleUndoLastPoint}
            onRedoLastPoint={handleRedoLastPoint}
            canUndo={canUndo}
            canRedo={canRedo}
            onBeginHistoryAction={pushHistorySnapshot}
            onNudgeCurrentPoint={(dpx, dpy) => handleNudgeCurrentPoint(dpx, dpy, 1)}
            onRegisterSnapshotGetter={(getter) => {
              snapshotGetterRef.current = getter;
            }}
          />
        )}
      </div>
    </div>
  );

  const showRightTelemetryPane = layout !== 'video-only' && !isRightPaneCollapsed;
  const effectiveLeftWidthPct =
    !showRightTelemetryPane
      ? 100
      : isLeftPaneCollapsed
      ? 0
      : leftPaneWidthPct;

  return (
    <div id="tracker-app-root" className="flex flex-col h-screen w-screen overflow-hidden bg-[#F1F3F5] text-[#1E293B]">
      {/* Bar 1: 28px Classic Desktop Application Menu Bar */}
      <Navbar
        currentExperimentId={currentExp.id}
        currentExperimentTitle={currentExp.title}
        onSelectExperiment={handleSelectExperiment}
        onUploadVideo={handleUploadVideo}
        onOpenProject={handleOpenProjectFile}
        onExportJSON={handleExportJSON}
        onSaveToFolder={handleSaveToFolder}
        onExportCSV={handleExportCSV}
        onOpenPdfReport={handleOpenReportModal}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        onOpenFormatsModal={handleOpenFormatsModal}
        onOpenDownloadExe={() => setIsDownloadExeOpen(true)}
        tracks={tracks}
        activeTrackId={activeTrackId}
        onSelectTrack={setActiveTrackId}
        onOpenTrackManager={() => setIsTrackManagerOpen(true)}
        onClearTrackPoints={handleClearTrackPoints}
        onUndoLastPoint={handleUndoLastPoint}
        onRedoLastPoint={handleRedoLastPoint}
        canUndo={canUndo}
        canRedo={canRedo}
        undoCount={undoStack.length}
        redoCount={redoStack.length}
        requireShiftToMark={requireShiftToMark}
        onToggleRequireShiftToMark={() => setRequireShiftToMark((prev) => !prev)}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={() => setAutoAdvance((prev) => !prev)}
        onOpenClipSettings={() => setIsClipModalOpen(true)}
        showTrails={showTrails}
        onToggleTrails={() => setShowTrails((prev) => !prev)}
        showVectors={showVectors}
        onToggleVectors={() => setShowVectors((prev) => !prev)}
        showLoupe={showLoupe}
        onToggleLoupe={() => setShowLoupe((prev) => !prev)}
        axes={axes}
        onToggleAxes={() => handleUpdateAxes({ visible: !axes.visible })}
        onToggleGrid={() => handleUpdateAxes({ gridVisible: !axes.gridVisible })}
        calibration={calibration}
        onToggleCalibration={() => handleUpdateCalibration({ visible: !calibration.visible })}
        onOpenCalibrationModal={() => setIsCalModalOpen(true)}
        onOpenTriangulationModal={() => setIsTriModalOpen(true)}
        onOpenMonocular6DoFModal={() => setIsMonocular6DoFOpen(true)}
        graphConfig={graphConfig}
        onUpdateGraphConfig={handleUpdateGraphConfig}
        layout={layout}
        onLayoutChange={handleLayoutChange}
        onResetSplitters={() => {
          updateLeftPaneWidth(50);
          updateTopRightHeight(50);
          updateLeftTopHeight(50);
        }}
        onSwapPanes={() => setIsPanesSwapped((prev) => !prev)}
        onOpenMetrologyAudit={() => {
          setMetrologyAuditPanel('panel1');
          setIsMetrologyAuditOpen(true);
        }}
        onResetWorkspace={handleResetWorkspace}
      />

      {/* Save / Project Notification Floating Toast */}
      {saveToast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#181B20] text-[#E2E8F0] px-4 py-2 rounded-[3px] border border-[#2A2E37] shadow-2xl flex items-center gap-2.5 text-xs font-mono pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-[#2563EB] shrink-0" />
          <div>
            <div className="font-bold text-white text-xs">{saveToast.message}</div>
            {saveToast.sub && <div className="text-[10px] text-slate-300">{saveToast.sub}</div>}
          </div>
        </div>
      )}

      {/* Tier 3 Universal Codec Bridge Progress Banner */}
      {transcodeProgress && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#181B20] text-[#E2E8F0] px-4 py-2.5 rounded-[3px] border border-[#2563EB] shadow-2xl flex flex-col gap-1.5 text-xs font-mono min-w-[340px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-white">{transcodeProgress.text}</span>
            <span className="text-[#38bdf8] font-bold">{Math.round(transcodeProgress.percent)}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#2A2E37] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2563EB] transition-all duration-150"
              style={{ width: `${Math.max(5, Math.min(100, transcodeProgress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {/* Bar 2: 34px Single Contextual Workflow Ribbon */}
      <Toolbar
        tracks={tracks}
        activeTrackId={activeTrackId}
        onSelectTrack={setActiveTrackId}
        onOpenTrackManager={() => setIsTrackManagerOpen(true)}
        onClearTrackPoints={handleClearTrackPoints}
        onUndoLastPoint={handleUndoLastPoint}
        onRedoLastPoint={handleRedoLastPoint}
        canUndo={canUndo}
        canRedo={canRedo}
        undoCount={undoStack.length}
        redoCount={redoStack.length}
        requireShiftToMark={requireShiftToMark}
        onToggleRequireShiftToMark={() => setRequireShiftToMark((prev) => !prev)}
        calibration={calibration}
        onToggleCalibration={() => handleUpdateCalibration({ visible: !calibration.visible })}
        onOpenCalibrationModal={() => setIsCalModalOpen(true)}
        axes={axes}
        onToggleAxes={() => handleUpdateAxes({ visible: !axes.visible })}
        onAxesAngleChange={(angle) => handleUpdateAxes({ angle })}
        onToggleGrid={() => handleUpdateAxes({ gridVisible: !axes.gridVisible })}
        showTrails={showTrails}
        onToggleTrails={() => setShowTrails(!showTrails)}
        showVectors={showVectors}
        onToggleVectors={() => setShowVectors(!showVectors)}
        showLoupe={showLoupe}
        onToggleLoupe={() => setShowLoupe(!showLoupe)}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={() => setAutoAdvance(!autoAdvance)}
        layout={layout}
        onLayoutChange={handleLayoutChange}
        onOpenClipSettings={() => setIsClipModalOpen(true)}
        analysisMode={analysisMode}
        onChangeAnalysisMode={handleChangeAnalysisMode}
        onOpenTriangulationModal={() => setIsTriModalOpen(true)}
        onOpenMonocular6DoFModal={() => setIsMonocular6DoFOpen(true)}
        triangulationCalibrated={triangulation.calibrated}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        graphConfig={graphConfig}
        onUpdateGraphConfig={handleUpdateGraphConfig}
        onOpenMetrologyAudit={() => {
          setMetrologyAuditPanel('panel1');
          setIsMetrologyAuditOpen(true);
        }}
      />

      {/* ======================== INTERACTIVE DRAGGABLE SPLIT-PANE WORKSPACE STAGE ======================== */}
      <main
        id="tracker-main-stage"
        ref={mainStageRef}
        className={`flex-1 flex min-h-0 overflow-hidden bg-[#F1F3F5] ${
          isPanesSwapped ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {maximizedPanel !== 'none' ? (
          /* ======================== MAXIMIZED SINGLE PANEL VIEW ======================== */
          <div className="w-full h-full flex flex-col min-w-0 min-h-0">
            {maximizedPanel === 'video' && (
              <>
                {renderPanelHeader(
                  'video',
                  'Video Tracking Feed (Maximized)',
                  `${currentExp.title} • Frame #${currentFrame}`,
                  <Video className="w-3.5 h-3.5" />
                )}
                <div className="flex-1 min-h-0">{renderVideoFeedContent()}</div>
              </>
            )}
            {maximizedPanel === '3d' && (
              <>
                {renderPanelHeader(
                  '3d',
                  '3D Spatial Viewport (Maximized)',
                  `${activeTrackObj?.name || 'Track'} • Frame #${currentFrame}`,
                  <Compass className="w-3.5 h-3.5" />
                )}
                <div className="flex-1 min-h-0">
                  <ThreeDTrajectoryView
                    tracks={tracks}
                    activeTrackId={activeTrackId}
                    currentFrame={currentFrame}
                    onSelectFrame={setCurrentFrame}
                    showVectors={showVectors}
                    showTrails={showTrails}
                  />
                </div>
              </>
            )}
            {maximizedPanel === 'graph' && (
              <>
                {renderPanelHeader(
                  'graph',
                  'Graph & Telemetry Inspector (Maximized)',
                  `${graphConfig.referenceFrameMode || 'M_wrt_L'} • ${
                    graphConfig.coordConvention || 'NED_Z_DOWN'
                  }`,
                  <Activity className="w-3.5 h-3.5" />
                )}
                <div className="flex-1 min-h-0">
                  <PlotView
                    tracks={tracks}
                    activeTrackId={activeTrackId}
                    currentFrame={currentFrame}
                    onSelectFrame={setCurrentFrame}
                    graphConfig={graphConfig}
                    onUpdateGraphConfig={handleUpdateGraphConfig}
                    analysisMode={normMetrologyMode}
                    fps={clip.fps}
                    onOpenMetrologyAudit={(panel) => {
                      setMetrologyAuditPanel(panel);
                      setIsMetrologyAuditOpen(true);
                    }}
                  />
                </div>
              </>
            )}
            {maximizedPanel === 'table' && (
              <>
                {renderPanelHeader(
                  'table',
                  'Data Table & Range-Safety Telemetry (Maximized)',
                  `${activeTrackObj?.steps.length || 0} rows`,
                  <TableIcon className="w-3.5 h-3.5" />
                )}
                <div className="flex-1 min-h-0">
                  <TableView
                    tracks={tracks}
                    activeTrackId={activeTrackId}
                    currentFrame={currentFrame}
                    clip={clip}
                    analysisMode={analysisMode}
                    graphConfig={graphConfig}
                    onSelectFrame={setCurrentFrame}
                    onDeletePoint={handleDeletePoint}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          /* ======================== INTERACTIVE MULTI-PANE DOCKING STAGE ======================== */
          <>
            {/* Collapsed Left Pane Vertical Tab */}
            {isLeftPaneCollapsed && (
              <div className="w-7 h-full bg-[#E2E8F0] border-r border-[#CBD5E1] flex flex-col items-center py-2 justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLeftPaneCollapsed(false)}
                  className="p-1 bg-[#2563EB] text-white rounded-[2px] hover:bg-[#1D4ED8] cursor-pointer"
                  title="Expand Left Visual Pane"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-[10px] text-[#334155] [writing-mode:vertical-rl] rotate-180 tracking-wider uppercase">
                  Video / 3D Visual Pane
                </span>
                <div />
              </div>
            )}

            {/* LEFT VISUAL PANE (Video Tracking Canvas & Optional Quad 3D Spatial Viewport) */}
            {!isLeftPaneCollapsed && (
              <div
                id="workspace-left-visual-pane"
                ref={leftPaneRef}
                style={{ width: `${effectiveLeftWidthPct}%` }}
                className="h-full flex flex-col min-w-0 min-h-0 overflow-hidden"
              >
                {layout === 'trajectory-3d' ? (
                  /* 3D Spatial Orbit Primary on Left */
                  <div className="flex-1 flex flex-col min-h-0">
                    {renderPanelHeader(
                      '3d',
                      '3D Spatial Viewport',
                      `${activeTrackObj?.name || 'Track'} • Orbit View`,
                      <Compass className="w-3.5 h-3.5" />,
                      () => setIsLeftPaneCollapsed(true)
                    )}
                    <div className="flex-1 min-h-0">
                      <ThreeDTrajectoryView
                        tracks={tracks}
                        activeTrackId={activeTrackId}
                        currentFrame={currentFrame}
                        onSelectFrame={setCurrentFrame}
                        showVectors={showVectors}
                        showTrails={showTrails}
                      />
                    </div>
                  </div>
                ) : layout === 'split-3d' ? (
                  /* QUAD TELEMETRY GRID LEFT SIDE: Top Video Feed + Draggable Horizontal Divider + Bottom 3D Spatial Viewport */
                  <>
                    <div
                      style={{ height: `calc(${leftTopHeightPct}% - 3px)` }}
                      className="flex flex-col min-h-[120px] overflow-hidden"
                    >
                      {renderPanelHeader(
                        'video',
                        analysisMode === '3D' ? 'Stereo Video Feed' : 'Video Tracking Feed',
                        `${effectiveLeftWidthPct.toFixed(0)}% W • F#${currentFrame}`,
                        <Video className="w-3.5 h-3.5" />,
                        () => setIsLeftPaneCollapsed(true)
                      )}
                      <div className="flex-1 min-h-0">{renderVideoFeedContent()}</div>
                    </div>

                    {/* Horizontal Splitter between Top-Left Video and Bottom-Left 3D Viewport */}
                    <div
                      id="quad-left-horizontal-splitter"
                      onMouseDown={handleStartLeftHorizontalDrag}
                      onDoubleClick={() => updateLeftTopHeight(50)}
                      className="h-1.5 cursor-row-resize bg-[#CBD5E1] hover:bg-[#2563EB] transition-colors flex items-center justify-center shrink-0 group border-y border-[#94A3B8]"
                      title="Drag to resize Video Feed vs 3D Spatial Viewport height (Double-click to reset to 50% / 50%)"
                    >
                      <GripHorizontal className="w-4 h-3 text-[#475569] group-hover:text-white" />
                    </div>

                    <div
                      style={{ height: `calc(${100 - leftTopHeightPct}% - 3px)` }}
                      className="flex flex-col min-h-[120px] overflow-hidden"
                    >
                      {renderPanelHeader(
                        '3d',
                        '3D Spatial Viewport',
                        `${activeTrackObj?.name || 'Track'}`,
                        <Compass className="w-3.5 h-3.5" />
                      )}
                      <div className="flex-1 min-h-0">
                        <ThreeDTrajectoryView
                          tracks={tracks}
                          activeTrackId={activeTrackId}
                          currentFrame={currentFrame}
                          onSelectFrame={setCurrentFrame}
                          showVectors={showVectors}
                          showTrails={showTrails}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* Standard Full-Height Video Tracking Feed on Left */
                  <div className="flex-1 flex flex-col min-h-0">
                    {renderPanelHeader(
                      'video',
                      analysisMode === '3D' ? 'Stereo Video Feed' : 'Video Tracking Feed',
                      layout === 'video-plot'
                        ? `Live Ref Monitor (${effectiveLeftWidthPct.toFixed(0)}% W)`
                        : `${effectiveLeftWidthPct.toFixed(0)}% W • Frame #${currentFrame}`,
                      <Video className="w-3.5 h-3.5" />,
                      showRightTelemetryPane ? () => setIsLeftPaneCollapsed(true) : undefined
                    )}
                    <div className="flex-1 min-h-0">{renderVideoFeedContent()}</div>
                  </div>
                )}
              </div>
            )}

            {/* INTERACTIVE VERTICAL SPLITTER HANDLE (18% Left / 82% Right to 85% Left / 15% Right) */}
            {showRightTelemetryPane && !isLeftPaneCollapsed && (
              <div
                id="workspace-vertical-splitter"
                onMouseDown={handleStartVerticalSplitDrag}
                onDoubleClick={() => updateLeftPaneWidth(50)}
                className="w-2 h-full cursor-col-resize bg-[#CBD5E1] hover:bg-[#2563EB] active:bg-[#1D4ED8] transition-colors flex flex-col items-center justify-center shrink-0 group border-x border-[#94A3B8] select-none z-20"
                title={`Drag to resize Left Visual (${leftPaneWidthPct.toFixed(
                  0
                )}%) vs Right Telemetry (${(100 - leftPaneWidthPct).toFixed(
                  0
                )}%) — Double-click to reset 50% / 50%`}
              >
                <GripVertical className="w-3.5 h-5 text-[#475569] group-hover:text-white" />
              </div>
            )}

            {/* RIGHT TELEMETRY PANE (Graph Inspector & Data Table) */}
            {showRightTelemetryPane && (
              <div
                id="workspace-right-telemetry-pane"
                ref={rightPaneRef}
                style={{ width: `${100 - effectiveLeftWidthPct}%` }}
                className="h-full flex flex-col min-w-0 min-h-0 overflow-hidden"
              >
                {layout === 'video-table' ? (
                  /* Full-Height Data Table */
                  <div className="flex-1 flex flex-col min-h-0">
                    {renderPanelHeader(
                      'table',
                      'Data Table & Range-Safety Telemetry',
                      `${activeTrackObj?.steps.length || 0} rows`,
                      <TableIcon className="w-3.5 h-3.5" />,
                      () => setIsRightPaneCollapsed(true)
                    )}
                    <div className="flex-1 min-h-0">
                      <TableView
                        tracks={tracks}
                        activeTrackId={activeTrackId}
                        currentFrame={currentFrame}
                        clip={clip}
                        analysisMode={analysisMode}
                        graphConfig={graphConfig}
                        onSelectFrame={setCurrentFrame}
                        onDeletePoint={handleDeletePoint}
                      />
                    </div>
                  </div>
                ) : (
                  /* Graph Inspector on Top + Collapsible / Resizable Data Table on Bottom */
                  <>
                    <div
                      style={{
                        height: isTableCollapsed
                          ? 'calc(100% - 26px)'
                          : `calc(${topRightHeightPct}% - 3px)`,
                      }}
                      className="flex flex-col min-h-[140px] overflow-hidden"
                    >
                      {renderPanelHeader(
                        'graph',
                        'Graph & Telemetry Inspector',
                        `${(100 - effectiveLeftWidthPct).toFixed(0)}% W • ${
                          graphConfig.referenceFrameMode || 'M_wrt_L'
                        } (${graphConfig.coordConvention || 'NED_Z_DOWN'})`,
                        <Activity className="w-3.5 h-3.5" />,
                        () => setIsRightPaneCollapsed(true)
                      )}
                      <div className="flex-1 min-h-0">
                        <PlotView
                          tracks={tracks}
                          activeTrackId={activeTrackId}
                          currentFrame={currentFrame}
                          onSelectFrame={setCurrentFrame}
                          graphConfig={graphConfig}
                          onUpdateGraphConfig={handleUpdateGraphConfig}
                          analysisMode={normMetrologyMode}
                          fps={clip.fps}
                          onOpenMetrologyAudit={(panel) => {
                            setMetrologyAuditPanel(panel);
                            setIsMetrologyAuditOpen(true);
                          }}
                        />
                      </div>
                    </div>

                    {!isTableCollapsed ? (
                      <>
                        {/* Interactive Horizontal Resizer Handle between Graph Plotter and Data Table */}
                        <div
                          id="workspace-right-horizontal-splitter"
                          onMouseDown={handleStartRightHorizontalDrag}
                          onDoubleClick={() => updateTopRightHeight(50)}
                          className="h-1.5 cursor-row-resize bg-[#CBD5E1] hover:bg-[#2563EB] active:bg-[#1D4ED8] transition-colors flex items-center justify-center shrink-0 group border-y border-[#94A3B8] select-none z-20"
                          title="Drag to resize Graph Inspector vs Data Table height (Double-click to reset to 50% / 50%)"
                        >
                          <GripHorizontal className="w-4 h-3 text-[#475569] group-hover:text-white" />
                        </div>

                        <div
                          style={{ height: `calc(${100 - topRightHeightPct}% - 3px)` }}
                          className="flex flex-col min-h-[100px] overflow-hidden"
                        >
                          {renderPanelHeader(
                            'table',
                            'Data Table & Telemetry Readout',
                            `${activeTrackObj?.steps.length || 0} rows`,
                            <TableIcon className="w-3.5 h-3.5" />,
                            () => setIsTableCollapsed(true)
                          )}
                          <div className="flex-1 min-h-0">
                            <TableView
                              tracks={tracks}
                              activeTrackId={activeTrackId}
                              currentFrame={currentFrame}
                              clip={clip}
                              analysisMode={analysisMode}
                              graphConfig={graphConfig}
                              onSelectFrame={setCurrentFrame}
                              onDeletePoint={handleDeletePoint}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Slim 26px Collapsed Data Table Status Bar (Default in Graph & Telemetry Focus) */
                      <div
                        id="collapsed-table-status-bar"
                        onClick={() => setIsTableCollapsed(false)}
                        className="h-[26px] bg-[#E2E8F0] hover:bg-[#CBD5E1] border-t border-[#CBD5E1] px-3 flex items-center justify-between text-[11px] cursor-pointer shrink-0 select-none"
                        title="Click to expand Data Table pane"
                      >
                        <div className="flex items-center gap-2 font-mono text-[#1E293B] truncate">
                          <TableIcon className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                          <span className="font-bold text-[#1E293B] font-sans">Data Table:</span>
                          <span>
                            {activeTrackObj?.name} ({activeTrackObj?.steps.length || 0} rows)
                          </span>
                          {currentStepObj && (
                            <span className="text-[#475569]">
                              • Cur F#{currentFrame}: X={currentStepObj.x.toFixed(3)}m, Y=
                              {currentStepObj.y.toFixed(3)}m
                              {currentStepObj.z !== undefined
                                ? `, Z=${currentStepObj.z.toFixed(3)}m`
                                : ''}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsTableCollapsed(false);
                          }}
                          className="px-2 py-0.5 bg-[#2563EB] text-white rounded-[2px] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <ChevronUp className="w-3 h-3" />
                          <span>Expand Table</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Collapsed Right Telemetry Pane Vertical Tab (or Mini Telemetry Toggle in Video Focus) */}
            {(isRightPaneCollapsed || layout === 'video-only') && (
              <div className="w-7 h-full bg-[#E2E8F0] border-l border-[#CBD5E1] flex flex-col items-center py-2 justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsRightPaneCollapsed(false);
                    if (layout === 'video-only') {
                      setLayout('split');
                      updateLeftPaneWidth(85);
                    }
                  }}
                  className="p-1 bg-[#2563EB] text-white rounded-[2px] hover:bg-[#1D4ED8] cursor-pointer"
                  title="Expand Telemetry & Graph Inspector (85% Video / 15% Telemetry)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-[10px] text-[#334155] [writing-mode:vertical-rl] rotate-180 tracking-wider uppercase">
                  Graph &amp; Telemetry Inspector
                </span>
                <div />
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals */}
      <CalibrationModal
        isOpen={isCalModalOpen}
        onClose={() => setIsCalModalOpen(false)}
        calibration={calibration}
        onSave={handleUpdateCalibration}
      />

      <ClipSettingsModal
        isOpen={isClipModalOpen}
        onClose={() => setIsClipModalOpen(false)}
        clip={clip}
        onSave={(updates) => setClip((prev) => ({ ...prev, ...updates }))}
        is3D={analysisMode === '3D'}
        triangulation={triangulation}
        onUpdateTriangulation={(tri) => setTriangulation((prev) => ({ ...prev, ...tri }))}
      />

      <TrackManagerModal
        isOpen={isTrackManagerOpen}
        onClose={() => setIsTrackManagerOpen(false)}
        tracks={tracks}
        activeTrackId={activeTrackId}
        onAddTrack={handleAddTrack}
        onUpdateTrack={handleUpdateTrack}
        onDeleteTrack={handleDeleteTrack}
        onSelectTrack={setActiveTrackId}
      />

      <TriangulationModal
        isOpen={isTriModalOpen}
        onClose={() => setIsTriModalOpen(false)}
        triangulation={triangulation}
        onSave={handleSaveTriangulation}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onOpenFormatsModal={handleOpenFormatsModal}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
      />

      <SupportedFormatsModal
        isOpen={isFormatsModalOpen}
        onClose={() => setIsFormatsModalOpen(false)}
        onSelectVideoFile={handleUploadVideo}
        initialTab={formatsModalInitialTab}
      />

      <DownloadExeModal
        isOpen={isDownloadExeOpen}
        onClose={() => setIsDownloadExeOpen(false)}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      <ExperimentReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        experimentTitle={currentExp.title}
        tracks={tracks}
        activeTrackId={activeTrackId}
        onSelectTrack={setActiveTrackId}
        clip={clip}
        calibration={calibration}
        axes={axes}
        videoSnapshotUrl={videoSnapshotUrl}
        videoUrl={videoUrl}
        analysisMode={analysisMode}
        triangulation={triangulation}
        onUpdateTriangulation={handleSaveTriangulation}
        currentFrame={currentFrame}
        onSeekFrame={setCurrentFrame}
        onCaptureSnapshot={() => (snapshotGetterRef.current ? snapshotGetterRef.current() : null)}
      />

      <Monocular6DoFModal
        isOpen={isMonocular6DoFOpen}
        onClose={() => setIsMonocular6DoFOpen(false)}
        tracks={tracks}
        fps={clip.fps}
        onApplySolvedTracks={(solvedTracks, newActiveId, graphConfigUpdates) => {
          pushHistorySnapshot('Solve Monocular 6-DOF Store Separation');
          setTracks(solvedTracks);
          setActiveTrackId(newActiveId);
          setAnalysisMode('6DOF');
          // Default graph config to NED +Z Down and M_wrt_L for immediate store separation inspection
          handleUpdateGraphConfig({
            varY: 'z',
            coordConvention: 'NED_Z_DOWN',
            referenceFrameMode: 'M_wrt_L',
            viewMode: 'dual-sync',
            ...graphConfigUpdates,
          });
          showToast(
            'Monocular 6-DOF Store Separation Solved',
            'Telemetry loaded into tracks (M wrt L, M wrt A, L wrt A) with Aerospace NED convention'
          );
        }}
      />

      <MetrologyAuditModal
        isOpen={isMetrologyAuditOpen}
        onClose={() => setIsMetrologyAuditOpen(false)}
        panel1Report={activeAuditReports.panel1ErrorReport}
        panel2Report={activeAuditReports.panel2ErrorReport}
        initialPanel={metrologyAuditPanel}
        onSelectFrame={setCurrentFrame}
        trackName={activeTrackObj?.name}
        fps={clip.fps}
      />

      {/* Client-side Video Format Warning Toast */}
      <FormatWarningToast
        probeResult={formatWarningProbe}
        onDismiss={() => setFormatWarningProbe(null)}
        onOpenPrepTips={() => {
          handleOpenFormatsModal('video-prep');
          setFormatWarningProbe(null);
        }}
      />
    </div>
  );
};

export default App;
