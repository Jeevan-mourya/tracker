/**
 * High-Speed Defense Camera Specifications & Utilities
 * Designed for Photron (FASTCAM series), Vision Research (Phantom), NAC, and IX Cameras.
 * Used in defense ballistics, aerospace propulsion, hypersonic shockwaves, and impact testing.
 */

export interface HighSpeedCameraModel {
  id: string;
  manufacturer: string;
  model: string;
  maxFpsFullRes: number;
  maxFpsReduced: number;
  sensorType: string;
  isoMonochrome: number;
  minExposureUs: number; // in microseconds
  commonUseCases: string;
  defaultFpsOptions: number[];
}

export const DEFENSE_HIGH_SPEED_CAMERAS: HighSpeedCameraModel[] = [
  {
    id: 'photron-saz',
    manufacturer: 'Photron',
    model: 'FASTCAM SA-Z',
    maxFpsFullRes: 20000, // 1024 x 1024 @ 20,000 fps
    maxFpsReduced: 2100000, // up to 2.1 Million fps at reduced resolution
    sensorType: '12-bit CMOS (20µm pixel pitch)',
    isoMonochrome: 50000,
    minExposureUs: 0.159, // 159 nanoseconds
    commonUseCases: 'Ballistics penetration, explosive detonation, armor testing, hypersonic shockwaves',
    defaultFpsOptions: [1000, 5000, 10000, 20000, 50000, 100000, 250000, 500000, 1000000],
  },
  {
    id: 'photron-mini-ax200',
    manufacturer: 'Photron',
    model: 'FASTCAM Mini AX200',
    maxFpsFullRes: 6400, // 1024 x 1024 @ 6,400 fps
    maxFpsReduced: 900000,
    sensorType: '12-bit CMOS',
    isoMonochrome: 40000,
    minExposureUs: 1.0,
    commonUseCases: 'Range projectile flight, munitions testing, high-G mechanical shock',
    defaultFpsOptions: [1000, 2000, 6400, 10000, 20000, 50000, 100000],
  },
  {
    id: 'photron-nova',
    manufacturer: 'Photron',
    model: 'FASTCAM Nova S16',
    maxFpsFullRes: 16000,
    maxFpsReduced: 1100000,
    sensorType: '12-bit Megapixel CMOS',
    isoMonochrome: 64000,
    minExposureUs: 0.2,
    commonUseCases: 'Supersonic wind tunnels, combustion, explosive fragmentation tracking',
    defaultFpsOptions: [1000, 5000, 10000, 16000, 32000, 100000, 500000],
  },
  {
    id: 'phantom-v2512',
    manufacturer: 'Vision Research Phantom',
    model: 'v2512 Ultrahigh-Speed',
    maxFpsFullRes: 25000, // 1280 x 800 @ 25,000 fps
    maxFpsReduced: 1000000,
    sensorType: '12-bit Custom CMOS (28µm pixel)',
    isoMonochrome: 100000,
    minExposureUs: 0.265,
    commonUseCases: 'Defense ballistics, shock tubes, destructive impact analysis, shaped charges',
    defaultFpsOptions: [1000, 5000, 12500, 25000, 50000, 100000, 250000, 1000000],
  },
  {
    id: 'phantom-v2640',
    manufacturer: 'Vision Research Phantom',
    model: 'v2640 4-Megapixel',
    maxFpsFullRes: 6600, // 2048 x 1952 @ 6,600 fps
    maxFpsReduced: 303000,
    sensorType: '4-Megapixel 12-bit CMOS',
    isoMonochrome: 16000,
    minExposureUs: 0.142,
    commonUseCases: 'High-detail missile tracking, sabot separation, multi-fragment trajectory',
    defaultFpsOptions: [1000, 2500, 6600, 10000, 20000, 50000, 100000],
  },
  {
    id: 'nac-hx3',
    manufacturer: 'NAC Image Technology',
    model: 'Memrecam HX-3',
    maxFpsFullRes: 5000,
    maxFpsReduced: 1300000,
    sensorType: 'High-G Rugged CMOS',
    isoMonochrome: 32000,
    minExposureUs: 0.2,
    commonUseCases: 'Onboard missile test vehicle, airborne high-G tracking, ordnance testing',
    defaultFpsOptions: [1000, 2500, 5000, 10000, 25000, 100000],
  },
  {
    id: 'ix-ispeed',
    manufacturer: 'iX Cameras',
    model: 'i-SPEED 726R',
    maxFpsFullRes: 8250,
    maxFpsReduced: 1000000,
    sensorType: 'Custom 20.78µm CMOS',
    isoMonochrome: 50000,
    minExposureUs: 0.168,
    commonUseCases: 'Defense test ranges, ballistic impact, hypervelocity projectiles',
    defaultFpsOptions: [1000, 5000, 8250, 10000, 25000, 100000, 500000],
  },
];

export interface HighSpeedPreset {
  label: string;
  fps: number;
  dtUs: number; // microseconds per frame
  category: 'standard' | 'high-speed' | 'ultra-high-speed' | 'hypersonic';
  description: string;
}

export const HIGH_SPEED_FRAME_RATE_PRESETS: HighSpeedPreset[] = [
  { label: '30 fps (Standard Web)', fps: 30, dtUs: 33333.33, category: 'standard', description: 'Standard consumer recording' },
  { label: '60 fps (Smooth Video)', fps: 60, dtUs: 16666.67, category: 'standard', description: 'Action camera standard' },
  { label: '120 fps (Slow-Mo)', fps: 120, dtUs: 8333.33, category: 'standard', description: 'Smartphone 2x slow-mo' },
  { label: '240 fps (Fast Motion)', fps: 240, dtUs: 4166.67, category: 'standard', description: 'GoPro / iPhone slow-mo' },
  { label: '500 fps (Mechanical Shock)', fps: 500, dtUs: 2000.0, category: 'high-speed', description: 'Springs, valves, airbag deployment' },
  { label: '1,000 fps (Industrial Defense)', fps: 1000, dtUs: 1000.0, category: 'high-speed', description: '1.0 ms dt — Missile launch, recoil dynamics, drone rotor aerodynamics' },
  { label: '2,000 fps (Ejection & Separation)', fps: 2000, dtUs: 500.0, category: 'high-speed', description: '500 µs dt — Sabot separation, canister gas ejection' },
  { label: '5,000 fps (Small Arms & Caliber)', fps: 500, dtUs: 200.0, category: 'high-speed', description: '200 µs dt — Gun muzzle blast, pistol projectile exit' },
  { label: '10,000 fps (Photron SA-Z Ballistics)', fps: 10000, dtUs: 100.0, category: 'ultra-high-speed', description: '100 µs dt — Rifle bullet flight (5.56mm/7.62mm), armor penetration' },
  { label: '20,000 fps (Photron Full Res SA-Z)', fps: 20000, dtUs: 50.0, category: 'ultra-high-speed', description: '50 µs dt — Ceramic plate shattering, explosive initiation' },
  { label: '25,000 fps (Phantom v2512 Standard)', fps: 25000, dtUs: 40.0, category: 'ultra-high-speed', description: '40 µs dt — Supersonic shock wave, tungsten penetrator' },
  { label: '50,000 fps (Detonation & Fragments)', fps: 50000, dtUs: 20.0, category: 'ultra-high-speed', description: '20 µs dt — Blast wave velocity, fragmentation arena test' },
  { label: '100,000 fps (High Explosive / Hypervelocity)', fps: 100000, dtUs: 10.0, category: 'hypersonic', description: '10 µs dt — Shaped charge jet formation, Mach 5+ hypersonics' },
  { label: '250,000 fps (Plasma & Laser Shock)', fps: 250000, dtUs: 4.0, category: 'hypersonic', description: '4 µs dt — Laser shock peening, explosive bridgewire detonators' },
  { label: '1,000,000 fps (Ultra-Fast Framing)', fps: 1000000, dtUs: 1.0, category: 'hypersonic', description: '1.0 µs (1000 ns) dt — Nuclear physics, hypervelocity railgun impacts' },
];

/**
 * Format timestamp dynamically with appropriate engineering units
 * (seconds, milliseconds, microseconds, or nanoseconds)
 */
export function formatHighSpeedTime(
  seconds: number,
  fps: number,
  forcedUnit?: 's' | 'ms' | 'us' | 'ns' | 'auto'
): string {
  const absSec = Math.abs(seconds);
  const unit = forcedUnit || (
    fps >= 100000 ? 'us' :
    fps >= 1000 ? 'ms' :
    's'
  );

  if (unit === 'ns') {
    return `${(seconds * 1e9).toFixed(1)} ns`;
  }
  if (unit === 'us') {
    return `${(seconds * 1e6).toFixed(2)} µs`;
  }
  if (unit === 'ms') {
    return `${(seconds * 1000).toFixed(3)} ms`;
  }

  // Seconds formatting: choose precision based on frame rate
  if (fps >= 100000) {
    return `${seconds.toFixed(6)} s`;
  }
  if (fps >= 10000) {
    return `${seconds.toFixed(5)} s`;
  }
  if (fps >= 1000) {
    return `${seconds.toFixed(4)} s`;
  }
  return `${seconds.toFixed(3)} s`;
}

/**
 * Convert velocity in m/s to Mach number at sea level standard atmosphere (343 m/s)
 */
export function velocityToMach(speedMps: number, soundSpeedMps = 343.0): number {
  return speedMps / soundSpeedMps;
}

/**
 * Convert acceleration in m/s² to Earth standard gravities (Gs)
 */
export function accelerationToG(accelMps2: number): number {
  return accelMps2 / 9.80665;
}

/**
 * Calculate recommended shutter speed / exposure time for motion blur suppression
 * based on expected projectile velocity and target blur displacement.
 */
export function calculateRequiredShutter(
  expectedVelocityMps: number,
  maxAcceptableBlurMm: number = 0.5
): {
  maxExposureSeconds: number;
  maxExposureUs: number;
  shutterFraction: string;
} {
  if (expectedVelocityMps <= 0) {
    return { maxExposureSeconds: 0.001, maxExposureUs: 1000, shutterFraction: '1/1000 s' };
  }
  const maxBlurMeters = maxAcceptableBlurMm / 1000;
  const tExp = maxBlurMeters / expectedVelocityMps;
  const tUs = tExp * 1e6;
  const denom = Math.round(1 / tExp);

  return {
    maxExposureSeconds: tExp,
    maxExposureUs: tUs,
    shutterFraction: denom > 1 ? `1/${denom.toLocaleString()} s` : `${tExp.toFixed(3)} s`,
  };
}
