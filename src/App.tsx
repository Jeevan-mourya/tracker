import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Toolbar, ViewLayout } from './components/Toolbar';
import { VideoPlayerView } from './components/VideoPlayerView';
import { DualVideoPlayerView } from './components/DualVideoPlayerView';
import { ThreeDTrajectoryView } from './components/ThreeDTrajectoryView';
import { PlotView } from './components/PlotView';
import { TableView } from './components/TableView';
import { CalibrationModal } from './components/CalibrationModal';
import { ClipSettingsModal } from './components/ClipSettingsModal';
import { TrackManagerModal } from './components/TrackManagerModal';
import { TriangulationModal } from './components/TriangulationModal';
import { HelpModal } from './components/HelpModal';
import { SAMPLE_EXPERIMENTS } from './data/samples';
import {
  Track,
  Calibration,
  CoordinateAxes,
  ClipSettings,
  PointStep,
  SampleExperiment,
  TriangulationConfig,
} from './types';
import { computeKinematics, pixelToWorld } from './utils/physics';
import {
  computeKinematics3D,
  buildDefaultDLT,
  triangulateDLT,
} from './utils/triangulation';

export const App: React.FC = () => {
  // Current experiment
  const [currentExp, setCurrentExp] = useState<SampleExperiment>(SAMPLE_EXPERIMENTS[0]);
  const [videoUrl, setVideoUrl] = useState<string>(SAMPLE_EXPERIMENTS[0].videoUrl);
  const [videoUrlCam2, setVideoUrlCam2] = useState<string>(SAMPLE_EXPERIMENTS[0].videoUrlCam2 || '');
  const [isSynthetic, setIsSynthetic] = useState<boolean>(false);

  // Analysis mode: 2D Single Video vs 3D Stereo Video
  const [analysisMode, setAnalysisMode] = useState<'2D' | '3D'>(
    SAMPLE_EXPERIMENTS[0].is3D ? '3D' : '2D'
  );

  // Calibration
  const [calibration, setCalibration] = useState<Calibration>(SAMPLE_EXPERIMENTS[0].calibration);

  // Coordinate Axes
  const [axes, setAxes] = useState<CoordinateAxes>(SAMPLE_EXPERIMENTS[0].axes);

  // 3D Triangulation Config
  const [triangulation, setTriangulation] = useState<TriangulationConfig>(
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
  const [clip, setClip] = useState<ClipSettings>(SAMPLE_EXPERIMENTS[0].clip);

  // Playback / scrubber frame
  const [currentFrame, setCurrentFrame] = useState<number>(0);

  // Tracks / Point Masses
  const [tracks, setTracks] = useState<Track[]>(() => {
    const defaultExp = SAMPLE_EXPERIMENTS[0];
    const initialSteps: PointStep[] = (defaultExp.samplePoints || []).map((pt) => {
      const world = pixelToWorld(pt.px, pt.py, defaultExp.axes, defaultExp.calibration);
      return {
        frame: pt.frame,
        time: (pt.frame - defaultExp.clip.startFrame) * (1 / defaultExp.clip.fps),
        px: pt.px,
        py: pt.py,
        x: world.x,
        y: world.y,
        cam1Px: pt.px,
        cam1Py: pt.py,
        cam2Px: pt.cam2Px,
        cam2Py: pt.cam2Py,
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

  const [activeTrackId, setActiveTrackId] = useState<string>('track-1');

  // Display toggles
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [showLoupe, setShowLoupe] = useState<boolean>(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);

  // Layout switcher: default to split-3d when 3D is active
  const [layout, setLayout] = useState<ViewLayout>(
    SAMPLE_EXPERIMENTS[0].is3D ? 'split-3d' : 'split'
  );

  // Tracker OSP Safety: require Shift+Click to mark points (prevents accidental clicks from adding points)
  const [requireShiftToMark, setRequireShiftToMark] = useState<boolean>(true);

  // Modals
  const [isCalModalOpen, setIsCalModalOpen] = useState(false);
  const [isClipModalOpen, setIsClipModalOpen] = useState(false);
  const [isTrackManagerOpen, setIsTrackManagerOpen] = useState(false);
  const [isTriModalOpen, setIsTriModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

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
  const handleChangeAnalysisMode = (mode: '2D' | '3D') => {
    setAnalysisMode(mode);
    if (mode === '3D') {
      if (layout === 'split') setLayout('split-3d');
    } else {
      if (layout === 'split-3d' || layout === 'trajectory-3d') setLayout('split');
    }
  };

  // Handle Experiment Selection
  const handleSelectExperiment = (exp: SampleExperiment) => {
    setCurrentExp(exp);
    setVideoUrl(exp.videoUrl);
    setVideoUrlCam2(exp.videoUrlCam2 || '');
    setIsSynthetic(false);
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
      return {
        frame: pt.frame,
        time: (pt.frame - exp.clip.startFrame) * (1 / exp.clip.fps),
        px: pt.px,
        py: pt.py,
        x: world.x,
        y: world.y,
        cam1Px: pt.px,
        cam1Py: pt.py,
        cam2Px: pt.cam2Px,
        cam2Py: pt.cam2Py,
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
  };

  // Handle Custom Video Upload with duration detection
  const handleUploadVideo = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setIsSynthetic(false);
    setCurrentFrame(0);

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

    setCurrentExp({
      id: 'custom-upload-' + Date.now(),
      title: file.name,
      description: `Custom video analysis (${file.name})`,
      category: 'custom',
      videoUrl: url,
      is3D: analysisMode === '3D',
      calibration: { ...calibration },
      axes: { ...axes },
      clip: initialClip,
    });

    // Probe duration from HTML5 video element
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const dur = probe.duration;
      if (dur && Number.isFinite(dur) && dur > 0) {
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
      }
    };

    // Reset track points for new video
    setTracks([
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
    ]);
  };

  const handleUploadCam1 = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoUrl(url); // We map cam1 to main videoUrl in state
    setIsSynthetic(false);
    setCurrentExp(prev => ({ 
      ...prev, 
      id: 'custom-cam1-' + Date.now(), 
      title: 'Stereo: ' + file.name,
      description: 'Custom Camera 1 upload',
      category: 'custom'
    }));

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const dur = probe.duration;
      if (dur && Number.isFinite(dur) && dur > 0) {
        const calculatedFrames = Math.max(10, Math.round(dur * 30));
        setClip((prev) => ({
          ...prev,
          totalFrames: Math.max(prev.totalFrames, calculatedFrames),
          endFrame: Math.max(prev.endFrame, calculatedFrames - 1),
        }));
      }
    };
  };

  const handleUploadCam2 = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoUrlCam2(url);
    setIsSynthetic(false);
    setCurrentExp(prev => ({ 
      ...prev, 
      id: 'custom-cam2-' + Date.now(), 
      title: 'Stereo: ' + file.name,
      description: 'Custom Camera 2 upload',
      category: 'custom'
    }));

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const dur = probe.duration;
      if (dur && Number.isFinite(dur) && dur > 0) {
        const calculatedFrames = Math.max(10, Math.round(dur * 30));
        setClip((prev) => ({
          ...prev,
          totalFrames: Math.max(prev.totalFrames, calculatedFrames),
          endFrame: Math.max(prev.endFrame, calculatedFrames - 1),
        }));
      }
    };
  };

  // 3D Point addition from Dual Video Player
  const handleAddPoint3D = (newStep: PointStep) => {
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

  const handleDeletePoint = (frame: number) => {
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

  const handleUndoLastPoint = () => {
    setTracks((prev) =>
      prev.map((trk) => {
        if (trk.id !== activeTrackId || trk.steps.length === 0) return trk;
        // If current frame has a point, delete it; otherwise remove the last step point
        const hasCur = trk.steps.some((s) => s.frame === currentFrame);
        const filtered = hasCur
          ? trk.steps.filter((s) => s.frame !== currentFrame)
          : trk.steps.slice(0, -1);
        return {
          ...trk,
          steps: analysisMode === '3D' ? computeKinematics3D(filtered, trk.mass) : computeKinematics(filtered, trk.mass),
        };
      })
    );
  };

  // Keyboard shortcut listener for Tracker-style efficiency (Ctrl+Z to undo point, Delete to delete current frame mark)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoLastPoint();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeletePoint(currentFrame);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFrame, activeTrackId, analysisMode]);

  const handleClearTrackPoints = () => {
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
              return {
                ...step,
                x: tri.x,
                y: tri.y,
                z: tri.z,
                residual: tri.residual,
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

  // Export Project (.trk JSON)
  const handleExportJSON = () => {
    const projectData = {
      version: '2.0.0',
      analysisMode,
      timestamp: new Date().toISOString(),
      experimentTitle: currentExp.title,
      videoUrl,
      videoUrlCam2,
      triangulation,
      calibration,
      axes,
      clip,
      tracks,
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentExp.id}_tracker_project.trk`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export CSV
  const handleExportCSV = () => {
    const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
    if (!activeTrack || activeTrack.steps.length === 0) return;

    const hasZ = activeTrack.steps.some((s) => s.z !== undefined);
    const headers = hasZ
      ? ['Frame', 'Time_s', 'x_m', 'y_m', 'z_m', 'vx_mps', 'vy_mps', 'vz_mps', 'v_mps', 'ax_mps2', 'ay_mps2', 'az_mps2', 'a_mps2', 'KE_J', 'PE_J']
      : ['Frame', 'Time_s', 'x_m', 'y_m', 'vx_mps', 'vy_mps', 'v_mps', 'ax_mps2', 'ay_mps2', 'a_mps2', 'KE_J', 'PE_J'];

    const rows = activeTrack.steps.map((s) => {
      const base = [
        s.frame,
        s.time.toFixed(5),
        s.x.toFixed(5),
        s.y.toFixed(5),
      ];
      if (hasZ) {
        base.push((s.z ?? 0).toFixed(5));
      }
      base.push(
        s.vx?.toFixed(5) ?? '',
        s.vy?.toFixed(5) ?? ''
      );
      if (hasZ) {
        base.push(s.vz?.toFixed(5) ?? '');
      }
      base.push(
        s.v?.toFixed(5) ?? '',
        s.ax?.toFixed(5) ?? '',
        s.ay?.toFixed(5) ?? ''
      );
      if (hasZ) {
        base.push(s.az?.toFixed(5) ?? '');
      }
      base.push(
        s.a?.toFixed(5) ?? '',
        s.kineticEnergy?.toFixed(5) ?? '',
        s.potentialEnergy?.toFixed(5) ?? ''
      );
      return base.join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.href = encodedUri;
    link.download = `${activeTrack.name}_data.csv`;
    link.click();
  };

  return (
    <div id="tracker-app-root" className="flex flex-col h-screen w-screen overflow-hidden bg-[#d4d0c8] text-black">
      {/* Top Navigation Bar */}
      <Navbar
        currentExperimentId={currentExp.id}
        currentExperimentTitle={currentExp.title}
        onSelectExperiment={handleSelectExperiment}
        onUploadVideo={handleUploadVideo}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      {/* Physics Toolbar */}
      <Toolbar
        tracks={tracks}
        activeTrackId={activeTrackId}
        onSelectTrack={setActiveTrackId}
        onOpenTrackManager={() => setIsTrackManagerOpen(true)}
        onClearTrackPoints={handleClearTrackPoints}
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
        onLayoutChange={setLayout}
        onOpenClipSettings={() => setIsClipModalOpen(true)}
        analysisMode={analysisMode}
        onChangeAnalysisMode={handleChangeAnalysisMode}
        onOpenTriangulationModal={() => setIsTriModalOpen(true)}
        triangulationCalibrated={triangulation.calibrated}
      />

      {/* Dynamic View Layout Area */}
      <main id="tracker-main-stage" className="flex-1 flex min-h-0 overflow-hidden bg-[#d4d0c8]">
        {analysisMode === '3D' ? (
          /* ======================== 3D STEREO MODE ======================== */
          <>
            {layout === 'trajectory-3d' ? (
              // 3D Spatial Trajectory Orbit Canvas + Graph/Table
              <>
                <div className="w-7/12 h-full flex flex-col min-w-0">
                  <ThreeDTrajectoryView
                    tracks={tracks}
                    activeTrackId={activeTrackId}
                    currentFrame={currentFrame}
                    onSelectFrame={setCurrentFrame}
                    showVectors={showVectors}
                    showTrails={showTrails}
                  />
                </div>
                <div className="w-5/12 h-full flex flex-col min-w-0 border-l border-[#808080]">
                  <div className="h-1/2 min-h-0 border-b border-[#808080]">
                    <PlotView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                    />
                  </div>
                  <div className="h-1/2 min-h-0">
                    <TableView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                      onDeletePoint={handleDeletePoint}
                    />
                  </div>
                </div>
              </>
            ) : layout === 'split-3d' ? (
              // Dual Video on Left, 3D Orbit View + Graph on Right
              <>
                <div className="w-1/2 lg:w-7/12 h-full flex flex-col min-w-0">
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
                    onUploadCam1={handleUploadCam1}
                    onUploadCam2={handleUploadCam2}
                    showTrails={showTrails}
                    showVectors={showVectors}
                    showLoupe={showLoupe}
                    autoAdvance={autoAdvance}
                  />
                </div>
                <div className="w-1/2 lg:w-5/12 h-full flex flex-col min-w-0 border-l border-[#808080]">
                  <div className="h-1/2 min-h-0 border-b border-[#808080]">
                    <ThreeDTrajectoryView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                      showVectors={showVectors}
                      showTrails={showTrails}
                    />
                  </div>
                  <div className="h-1/2 min-h-0">
                    <PlotView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                    />
                  </div>
                </div>
              </>
            ) : layout === 'split' ? (
              // Dual Video on Left, Plot + Table on Right
              <>
                <div className="w-1/2 lg:w-7/12 h-full flex flex-col min-w-0">
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
                    onUploadCam1={handleUploadCam1}
                    onUploadCam2={handleUploadCam2}
                    showTrails={showTrails}
                    showVectors={showVectors}
                    showLoupe={showLoupe}
                    autoAdvance={autoAdvance}
                  />
                </div>
                <div className="w-1/2 lg:w-5/12 h-full flex flex-col min-w-0 border-l border-[#808080]">
                  <div className="h-1/2 min-h-0 border-b border-[#808080]">
                    <PlotView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                    />
                  </div>
                  <div className="h-1/2 min-h-0">
                    <TableView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                      onDeletePoint={handleDeletePoint}
                    />
                  </div>
                </div>
              </>
            ) : layout === 'video-plot' ? (
              <>
                <div className="w-1/2 h-full flex flex-col min-w-0">
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
                    showTrails={showTrails}
                    showVectors={showVectors}
                    showLoupe={showLoupe}
                    autoAdvance={autoAdvance}
                    requireShiftToMark={requireShiftToMark}
                    onUndoLastPoint={handleUndoLastPoint}
                  />
                </div>
                <div className="w-1/2 h-full flex flex-col min-w-0 border-l border-[#808080]">
                  <PlotView
                    tracks={tracks}
                    activeTrackId={activeTrackId}
                    currentFrame={currentFrame}
                    onSelectFrame={setCurrentFrame}
                  />
                </div>
              </>
            ) : layout === 'video-table' ? (
              <>
                <div className="w-1/2 h-full flex flex-col min-w-0">
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
                    showTrails={showTrails}
                    showVectors={showVectors}
                    showLoupe={showLoupe}
                    autoAdvance={autoAdvance}
                    requireShiftToMark={requireShiftToMark}
                    onUndoLastPoint={handleUndoLastPoint}
                  />
                </div>
                <div className="w-1/2 h-full flex flex-col min-w-0 border-l border-[#808080]">
                  <TableView
                    tracks={tracks}
                    activeTrackId={activeTrackId}
                    currentFrame={currentFrame}
                    onSelectFrame={setCurrentFrame}
                    onDeletePoint={handleDeletePoint}
                  />
                </div>
              </>
            ) : (
              // video-only
              <div className="w-full h-full flex flex-col min-w-0">
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
                  showTrails={showTrails}
                  showVectors={showVectors}
                  showLoupe={showLoupe}
                  autoAdvance={autoAdvance}
                  requireShiftToMark={requireShiftToMark}
                  onUndoLastPoint={handleUndoLastPoint}
                />
              </div>
            )}
          </>
        ) : (
          /* ======================== 2D SINGLE CAMERA MODE ======================== */
          <>
            {/* Left: Video Player and Canvas Tracking Stage */}
            <div
              className={`${
                layout === 'video-only'
                  ? 'w-full'
                  : layout === 'split'
                  ? 'w-1/2 lg:w-7/12'
                  : 'w-1/2'
              } h-full flex flex-col min-w-0`}
            >
              <VideoPlayerView
                videoUrl={videoUrl}
                isSynthetic={isSynthetic}
                syntheticType={currentExp.id}
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
              />
            </div>

            {/* Right Analysis Pane */}
            {layout !== 'video-only' && (
              <div
                className={`${
                  layout === 'split' ? 'w-1/2 lg:w-5/12' : 'w-1/2'
                } h-full flex flex-col min-w-0 border-l border-[#808080]`}
              >
                {layout === 'split' ? (
                  // Split: Plot on Top, Table on Bottom
                  <div className="flex-1 flex flex-col h-full min-h-0">
                    <div className="h-1/2 min-h-0 border-b border-[#808080]">
                      <PlotView
                        tracks={tracks}
                        activeTrackId={activeTrackId}
                        currentFrame={currentFrame}
                        onSelectFrame={setCurrentFrame}
                      />
                    </div>
                    <div className="h-1/2 min-h-0">
                      <TableView
                        tracks={tracks}
                        activeTrackId={activeTrackId}
                        currentFrame={currentFrame}
                        onSelectFrame={setCurrentFrame}
                        onDeletePoint={handleDeletePoint}
                      />
                    </div>
                  </div>
                ) : layout === 'video-plot' ? (
                  // Plot Only
                  <div className="flex-1 h-full min-h-0">
                    <PlotView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                    />
                  </div>
                ) : (
                  // Table Only
                  <div className="flex-1 h-full min-h-0">
                    <TableView
                      tracks={tracks}
                      activeTrackId={activeTrackId}
                      currentFrame={currentFrame}
                      onSelectFrame={setCurrentFrame}
                      onDeletePoint={handleDeletePoint}
                    />
                  </div>
                )}
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

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};

export default App;
