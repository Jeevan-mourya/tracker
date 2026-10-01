import { SampleExperiment } from '../types';
import { SAMPLE_3D_EXPERIMENTS } from './samples3d';

export const SAMPLE_EXPERIMENTS: SampleExperiment[] = [
  {
    id: 'ball-toss',
    title: 'Ball Toss (Projectile Motion)',
    description: 'Classic vertical and horizontal projectile motion of a thrown ball. Observe parabolic trajectory y(t) with constant downward acceleration g ≈ 9.8 m/s² and constant horizontal velocity vx.',
    videoUrl: './videos/ball_toss.mp4',
    category: 'Projectile Motion',
    calibration: {
      active: true,
      pointA: { x: 120, y: 380 },
      pointB: { x: 120, y: 140 },
      realLength: 1.0,
      unit: 'm',
      scale: 240, // 240 pixels per meter
      locked: true,
      visible: true,
    },
    axes: {
      origin: { x: 120, y: 380 },
      angle: 0,
      visible: true,
      locked: false,
      gridVisible: true,
    },
    clip: {
      startFrame: 0,
      endFrame: 28,
      stepSize: 1,
      fps: 30,
      startTime: 0.0,
      frameDt: 1 / 30,
      dt: 1 / 30,
      totalFrames: 29,
    },
    samplePoints: [
      { frame: 0, px: 130, py: 360 },
      { frame: 1, px: 142, py: 328 },
      { frame: 2, px: 154, py: 299 },
      { frame: 3, px: 167, py: 273 },
      { frame: 4, px: 180, py: 249 },
      { frame: 5, px: 194, py: 228 },
      { frame: 6, px: 207, py: 210 },
      { frame: 7, px: 221, py: 195 },
      { frame: 8, px: 235, py: 183 },
      { frame: 9, px: 249, py: 174 },
      { frame: 10, px: 263, py: 168 },
      { frame: 11, px: 277, py: 165 }, // apex
      { frame: 12, px: 291, py: 166 },
      { frame: 13, px: 305, py: 170 },
      { frame: 14, px: 319, py: 177 },
      { frame: 15, px: 333, py: 187 },
      { frame: 16, px: 347, py: 200 },
      { frame: 17, px: 361, py: 216 },
      { frame: 18, px: 375, py: 235 },
      { frame: 19, px: 389, py: 257 },
      { frame: 20, px: 403, py: 282 },
      { frame: 21, px: 417, py: 310 },
      { frame: 22, px: 431, py: 341 },
      { frame: 23, px: 445, py: 375 },
    ],
  },
  ...SAMPLE_3D_EXPERIMENTS,
  {
    id: 'ballistic-bullet-10k',
    title: 'Photron FASTCAM: 5.56mm Ballistic Impact (10,000 fps)',
    description: 'Recorded with a Photron FASTCAM SA-Z at 10,000 fps (Δt = 100 µs). Tracks a 5.56×45mm NATO projectile entering a transparent ballistic gelatin / armor test block. Observe supersonic muzzle flight at 920 m/s (Mach 2.68), impact flash, dynamic cavitation cavity, and rapid high-G deceleration (>60,000 g).',
    videoUrl: './videos/ball_toss.mp4',
    category: 'Defense & Ballistics (High-Speed)',
    syntheticType: 'ballistic-bullet-10k',
    calibration: {
      active: true,
      pointA: { x: 50, y: 350 },
      pointB: { x: 550, y: 350 },
      realLength: 0.50, // 0.50 meter fiducial block
      unit: 'm',
      scale: 1000, // 1000 pixels per meter (1 mm per pixel)
      locked: true,
      visible: true,
    },
    axes: {
      origin: { x: 50, y: 240 },
      angle: 0,
      visible: true,
      locked: false,
      gridVisible: true,
    },
    clip: {
      startFrame: 0,
      endFrame: 25,
      stepSize: 1,
      fps: 10000, // 10,000 frames per second
      playbackFps: 30, // 30 fps container playback
      startTime: 0.0,
      frameDt: 1 / 10000,
      dt: 1 / 10000,
      totalFrames: 26,
      cameraModel: 'Photron FASTCAM SA-Z',
      timeUnit: 'us',
    },
    samplePoints: [
      // Free flight in air at ~920 m/s: Δx = 920 * 0.0001 = 0.092 m = 92 px per frame
      { frame: 0, px: 50, py: 240 },
      { frame: 1, px: 142, py: 240 },
      { frame: 2, px: 234, py: 240 },
      { frame: 3, px: 326, py: 240 }, // Impact boundary at px ~ 350
      // Penetration inside dense block: rapid deceleration
      { frame: 4, px: 395, py: 240 },
      { frame: 5, px: 445, py: 240 },
      { frame: 6, px: 480, py: 240 },
      { frame: 7, px: 503, py: 240 },
      { frame: 8, px: 518, py: 240 },
      { frame: 9, px: 527, py: 240 },
      { frame: 10, px: 532, py: 240 },
      { frame: 11, px: 534, py: 240 }, // projectile stops
      { frame: 12, px: 535, py: 240 },
      { frame: 13, px: 535, py: 240 },
      { frame: 14, px: 535, py: 240 },
      { frame: 15, px: 535, py: 240 },
      { frame: 16, px: 535, py: 240 },
      { frame: 17, px: 535, py: 240 },
      { frame: 18, px: 535, py: 240 },
      { frame: 19, px: 535, py: 240 },
      { frame: 20, px: 535, py: 240 },
      { frame: 21, px: 535, py: 240 },
      { frame: 22, px: 535, py: 240 },
      { frame: 23, px: 535, py: 240 },
      { frame: 24, px: 535, py: 240 },
      { frame: 25, px: 535, py: 240 },
    ],
  },
  {
    id: 'supersonic-shockwave-25k',
    title: 'Phantom v2512: Mach 2.4 Supersonic Shockwave (25,000 fps)',
    description: 'High-speed Schlieren imaging at 25,000 fps (Δt = 40 µs) with a Vision Research Phantom v2512. Projectile traverses aerodynamic test section at 825 m/s (Mach 2.40). Observe the conical oblique shockwave envelope (Mach angle μ = 24.6°) and steady aerodynamic flowfield.',
    videoUrl: '/videos/ball_toss.mp4',
    category: 'Defense & Ballistics (High-Speed)',
    syntheticType: 'supersonic-shockwave-25k',
    calibration: {
      active: true,
      pointA: { x: 50, y: 350 },
      pointB: { x: 450, y: 350 },
      realLength: 0.80, // 0.80 m test section
      unit: 'm',
      scale: 500, // 500 px/m
      locked: true,
      visible: true,
    },
    axes: {
      origin: { x: 50, y: 240 },
      angle: 0,
      visible: true,
      locked: false,
      gridVisible: true,
    },
    clip: {
      startFrame: 0,
      endFrame: 16,
      stepSize: 1,
      fps: 25000, // 25,000 fps
      playbackFps: 30,
      startTime: 0.0,
      frameDt: 1 / 25000,
      dt: 1 / 25000,
      totalFrames: 17,
      cameraModel: 'Vision Research Phantom v2512',
      timeUnit: 'us',
    },
    samplePoints: Array.from({ length: 17 }, (_, i) => {
      // 825 m/s at 25000 fps -> 825 * (1/25000) = 0.033 m = 16.5 px per frame
      const px = Math.round(50 + i * 33);
      return { frame: i, px, py: 240 };
    }),
  },
  {
    id: 'ball-toss-slow',
    title: 'Ball Toss (Slow Motion)',
    description: 'High frame-rate projectile recording capturing detailed rotational spin and clean kinematics of an airborne ball.',
    videoUrl: './videos/ball_toss_slow.mp4',
    category: 'Projectile Motion',
    calibration: {
      active: true,
      pointA: { x: 100, y: 350 },
      pointB: { x: 100, y: 150 },
      realLength: 1.0,
      unit: 'm',
      scale: 200,
      locked: true,
      visible: true,
    },
    axes: {
      origin: { x: 100, y: 350 },
      angle: 0,
      visible: true,
      locked: false,
      gridVisible: true,
    },
    clip: {
      startFrame: 0,
      endFrame: 45,
      stepSize: 1,
      fps: 60,
      startTime: 0.0,
      frameDt: 1 / 60,
      dt: 1 / 60,
      totalFrames: 46,
    },
  },
  {
    id: 'pendulum-oscillator',
    title: 'Harmonic Motion: Simple Pendulum',
    description: 'A 1.0 m length pendulum swinging back and forth. Analyze sinusoidal displacement x(t) and phase velocity v(t), period T = 2π√(L/g) ≈ 2.0 s.',
    videoUrl: './videos/ball_toss.mp4',
    category: 'Harmonic Motion',
    calibration: {
      active: true,
      pointA: { x: 300, y: 80 },
      pointB: { x: 300, y: 320 },
      realLength: 1.0,
      unit: 'm',
      scale: 240,
      locked: true,
      visible: true,
    },
    axes: {
      origin: { x: 300, y: 80 },
      angle: 0,
      visible: true,
      locked: false,
      gridVisible: true,
    },
    clip: {
      startFrame: 0,
      endFrame: 60,
      stepSize: 1,
      fps: 30,
      startTime: 0.0,
      frameDt: 1 / 30,
      dt: 1 / 30,
      totalFrames: 61,
    },
    samplePoints: Array.from({ length: 61 }, (_, i) => {
      const t = i / 30;
      const omega = Math.sqrt(9.81 / 1.0); // ~3.13 rad/s
      const theta0 = (25 * Math.PI) / 180; // 25 degrees
      const theta = theta0 * Math.cos(omega * t);
      const L_px = 240;
      const px = 300 + L_px * Math.sin(theta);
      const py = 80 + L_px * Math.cos(theta);
      return { frame: i, px: Math.round(px), py: Math.round(py) };
    }),
  },
  {
    id: 'incline-cart',
    title: 'Inclined Plane (Tilted Axes a = g·sin θ)',
    description: 'A low-friction cart rolling down a track inclined at 15°. Demonstrates rotating coordinate axes along the incline so acceleration is purely along the +x axis.',
    videoUrl: './videos/ball_toss_slow.mp4',
    category: 'Newtonian Dynamics',
    calibration: {
      active: true,
      pointA: { x: 100, y: 150 },
      pointB: { x: 500, y: 257 },
      realLength: 1.5,
      unit: 'm',
      scale: 276,
      locked: true,
      visible: true,
    },
    axes: {
      origin: { x: 100, y: 150 },
      angle: -15, // tilted 15 degrees down
      visible: true,
      locked: false,
      gridVisible: true,
    },
    clip: {
      startFrame: 0,
      endFrame: 50,
      stepSize: 1,
      fps: 30,
      startTime: 0.0,
      frameDt: 1 / 30,
      dt: 1 / 30,
      totalFrames: 51,
    },
    samplePoints: Array.from({ length: 45 }, (_, i) => {
      const t = i / 30;
      const a = 9.81 * Math.sin((15 * Math.PI) / 180); // ~2.54 m/s²
      const x_meters = 0.5 * a * t * t;
      const scale = 276;
      const dist_px = x_meters * scale;
      const rad = (-15 * Math.PI) / 180;
      const px = 100 + dist_px * Math.cos(rad);
      const py = 150 - dist_px * Math.sin(rad);
      return { frame: i, px: Math.round(px), py: Math.round(py) };
    }),
  },
];
