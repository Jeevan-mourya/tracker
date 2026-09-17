import { SampleExperiment } from '../types';
import { SAMPLE_3D_EXPERIMENTS } from './samples3d';

export const SAMPLE_EXPERIMENTS: SampleExperiment[] = [
  ...SAMPLE_3D_EXPERIMENTS,
  {
    id: 'ball-toss',
    title: 'Ball Toss (Projectile Motion)',
    description: 'Classic vertical and horizontal projectile motion of a thrown ball. Observe parabolic trajectory y(t) with constant downward acceleration g ≈ 9.8 m/s² and constant horizontal velocity vx.',
    videoUrl: '/videos/ball_toss.mp4',
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
  {
    id: 'ball-toss-slow',
    title: 'Ball Toss (Slow Motion)',
    description: 'High frame-rate projectile recording capturing detailed rotational spin and clean kinematics of an airborne ball.',
    videoUrl: '/videos/ball_toss_slow.mp4',
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
    videoUrl: '', // Canvas-simulated video generator
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
    videoUrl: '', // Canvas-simulated video generator
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
