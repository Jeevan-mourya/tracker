/**
 * Defense-Grade Sub-Pixel 2D Template Auto-Tracker (TEMA / TrackEye / OSP Architecture)
 *
 * Implements:
 * 1. Zero-Mean Normalized Cross-Correlation (ZNCC) template matching within a configurable search window
 * 2. 2D Sub-Pixel Parabolic Peak Refinement (1/20th pixel precision) around the integer correlation peak
 * 3. Adaptive template blending (controlled evolution rate) to handle slight perspective/lighting changes
 * 4. Direct integration with AviHighSpeedLoader (zero-copy File.slice() frame decoding) and HTMLCanvasElement
 */

import {
  extractImageDataFromFrameSource,
  UnifiedFrameSource,
} from '../video/unifiedFrameSource';

export interface AutoTrackerConfig {
  templateRadius: number; // Half-width of template patch in pixels (default: 7 -> 15x15 patch)
  searchRadius: number; // Search window radius around predicted position in pixels (default: 24)
  minCorrelationScore: number; // Minimum ZNCC threshold in [0, 1] to accept match (default: 0.65)
  templateEvolutionRate: number; // Alpha in [0, 0.3] for updating template from matched patch (default: 0.08)
  useVelocityPrediction: boolean; // Predict search center from prior frame velocity (default: true)
}

export const DEFAULT_AUTO_TRACKER_CONFIG: AutoTrackerConfig = {
  templateRadius: 7,
  searchRadius: 24,
  minCorrelationScore: 0.65,
  templateEvolutionRate: 0.08,
  useVelocityPrediction: true,
};

export interface TemplatePatch {
  width: number;
  height: number;
  radius: number;
  luminance: Float32Array;
  mean: number;
  stdDev: number;
}

export interface SubPixelMatchResult {
  matched: boolean;
  u: number; // Refined sub-pixel horizontal coordinate
  v: number; // Refined sub-pixel vertical coordinate
  intU: number; // Integer peak u
  intV: number; // Integer peak v
  znccScore: number; // Peak Zero-Mean Normalized Cross-Correlation in [-1, 1]
}

/**
 * Converts an RGBA ImageData buffer into a single-channel luminance Float32Array (ITU-R BT.601).
 */
export function extractLuminanceBuffer(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return lum;
}

/**
 * Bilinearly samples a luminance image at fractional coordinates (x, y) with clamping at borders.
 */
export function sampleLuminanceBilinear(
  lum: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const cx = Math.max(0, Math.min(width - 1.0001, x));
  const cy = Math.max(0, Math.min(height - 1.0001, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;

  const v00 = lum[y0 * width + x0];
  const v10 = lum[y0 * width + x1];
  const v01 = lum[y1 * width + x0];
  const v11 = lum[y1 * width + x1];

  return (
    v00 * (1 - fx) * (1 - fy) +
    v10 * fx * (1 - fy) +
    v01 * (1 - fx) * fy +
    v11 * fx * fy
  );
}

/**
 * Extracts a normalized template patch centered at (centerU, centerV) from a luminance buffer.
 */
export function extractTemplatePatch(
  lum: Float32Array,
  imgWidth: number,
  imgHeight: number,
  centerU: number,
  centerV: number,
  radius: number
): TemplatePatch {
  const size = 2 * radius + 1;
  const patch = new Float32Array(size * size);
  let sum = 0;

  let idx = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const val = sampleLuminanceBilinear(lum, imgWidth, imgHeight, centerU + dx, centerV + dy);
      patch[idx++] = val;
      sum += val;
    }
  }

  const mean = sum / patch.length;
  let sqSum = 0;
  for (let i = 0; i < patch.length; i++) {
    const d = patch[i] - mean;
    sqSum += d * d;
  }
  const stdDev = Math.sqrt(Math.max(1e-9, sqSum));

  return {
    width: size,
    height: size,
    radius,
    luminance: patch,
    mean,
    stdDev,
  };
}

/**
 * Computes Zero-Mean Normalized Cross-Correlation (ZNCC) between a TemplatePatch and
 * a candidate integer location (candU, candV) in the target luminance image.
 */
export function evaluateZNCCAtPoint(
  template: TemplatePatch,
  targetLum: Float32Array,
  imgWidth: number,
  imgHeight: number,
  candU: number,
  candV: number
): number {
  const r = template.radius;
  const n = template.luminance.length;

  let sumTarget = 0;
  for (let dy = -r; dy <= r; dy++) {
    const y = Math.max(0, Math.min(imgHeight - 1, candV + dy));
    const rowOff = y * imgWidth;
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.max(0, Math.min(imgWidth - 1, candU + dx));
      sumTarget += targetLum[rowOff + x];
    }
  }
  const meanTarget = sumTarget / n;

  let num = 0;
  let denomTargetSq = 0;
  let tIdx = 0;

  for (let dy = -r; dy <= r; dy++) {
    const y = Math.max(0, Math.min(imgHeight - 1, candV + dy));
    const rowOff = y * imgWidth;
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.max(0, Math.min(imgWidth - 1, candU + dx));
      const dT = template.luminance[tIdx++] - template.mean;
      const dI = targetLum[rowOff + x] - meanTarget;
      num += dT * dI;
      denomTargetSq += dI * dI;
    }
  }

  const denom = template.stdDev * Math.sqrt(Math.max(1e-9, denomTargetSq));
  if (denom < 1e-7) return 0;
  return Math.max(-1, Math.min(1, num / denom));
}

/**
 * Searches for a TemplatePatch around (searchCenterU, searchCenterV) in targetLum using ZNCC
 * and refines the correlation peak to sub-pixel precision via 2D parabolic interpolation.
 */
export function matchTemplateZNCCSubPixel(
  template: TemplatePatch,
  targetLum: Float32Array,
  imgWidth: number,
  imgHeight: number,
  searchCenterU: number,
  searchCenterV: number,
  config: AutoTrackerConfig = DEFAULT_AUTO_TRACKER_CONFIG
): SubPixelMatchResult {
  const sr = Math.max(2, Math.round(config.searchRadius));
  const minU = Math.max(template.radius + 1, Math.round(searchCenterU) - sr);
  const maxU = Math.min(imgWidth - template.radius - 2, Math.round(searchCenterU) + sr);
  const minV = Math.max(template.radius + 1, Math.round(searchCenterV) - sr);
  const maxV = Math.min(imgHeight - template.radius - 2, Math.round(searchCenterV) + sr);

  if (minU > maxU || minV > maxV) {
    return {
      matched: false,
      u: searchCenterU,
      v: searchCenterV,
      intU: Math.round(searchCenterU),
      intV: Math.round(searchCenterV),
      znccScore: 0,
    };
  }

  let bestU = Math.round(searchCenterU);
  let bestV = Math.round(searchCenterV);
  let bestScore = -2;

  for (let v = minV; v <= maxV; v++) {
    for (let u = minU; u <= maxU; u++) {
      const score = evaluateZNCCAtPoint(template, targetLum, imgWidth, imgHeight, u, v);
      if (score > bestScore) {
        bestScore = score;
        bestU = u;
        bestV = v;
      }
    }
  }

  // 2D Sub-Pixel Parabolic Peak Fitting along U and V axes around (bestU, bestV)
  let deltaU = 0;
  let deltaV = 0;

  if (bestU > minU && bestU < maxU) {
    const sLeft = evaluateZNCCAtPoint(template, targetLum, imgWidth, imgHeight, bestU - 1, bestV);
    const sRight = evaluateZNCCAtPoint(template, targetLum, imgWidth, imgHeight, bestU + 1, bestV);
    const denomU = 2 * (sLeft - 2 * bestScore + sRight);
    if (Math.abs(denomU) > 1e-7) {
      const offset = (sLeft - sRight) / denomU;
      if (Math.abs(offset) <= 0.75) {
        deltaU = offset;
      }
    }
  }

  if (bestV > minV && bestV < maxV) {
    const sUp = evaluateZNCCAtPoint(template, targetLum, imgWidth, imgHeight, bestU, bestV - 1);
    const sDown = evaluateZNCCAtPoint(template, targetLum, imgWidth, imgHeight, bestU, bestV + 1);
    const denomV = 2 * (sUp - 2 * bestScore + sDown);
    if (Math.abs(denomV) > 1e-7) {
      const offset = (sUp - sDown) / denomV;
      if (Math.abs(offset) <= 0.75) {
        deltaV = offset;
      }
    }
  }

  const subU = bestU + deltaU;
  const subV = bestV + deltaV;

  return {
    matched: bestScore >= config.minCorrelationScore,
    u: Number(subU.toFixed(4)),
    v: Number(subV.toFixed(4)),
    intU: bestU,
    intV: bestV,
    znccScore: Number(bestScore.toFixed(4)),
  };
}

/**
 * Adaptively blends a newly matched patch into the reference template to handle gradual
 * illumination or slight out-of-plane rotation changes without template drift.
 */
export function evolveTemplatePatch(
  reference: TemplatePatch,
  currentPatch: TemplatePatch,
  evolutionRate: number
): TemplatePatch {
  const alpha = Math.max(0, Math.min(0.5, evolutionRate));
  if (alpha <= 0 || reference.luminance.length !== currentPatch.luminance.length) {
    return reference;
  }

  const n = reference.luminance.length;
  const blended = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const val = (1 - alpha) * reference.luminance[i] + alpha * currentPatch.luminance[i];
    blended[i] = val;
    sum += val;
  }
  const mean = sum / n;
  let sqSum = 0;
  for (let i = 0; i < n; i++) {
    const d = blended[i] - mean;
    sqSum += d * d;
  }

  return {
    ...reference,
    luminance: blended,
    mean,
    stdDev: Math.sqrt(Math.max(1e-9, sqSum)),
  };
}

/**
 * Unified frame pixel sampler for ZNCC auto-tracking across both `UnifiedFrameSource`
 * (.AVI, Photo-JPEG .MOV, .GIF, image sequences, single images) and native HTML5 `<video>`.
 * Whenever a `UnifiedFrameSource` is active, fetches frame pixels directly via
 * `await frameSource.getFrame(frameIndex)` (drawn to an offscreen canvas for `getImageData`)
 * instead of reading from an unmounted `<video>` element.
 */
export async function sampleFrameImageDataFromViewport(
  frameSource: UnifiedFrameSource | null,
  videoElement: HTMLVideoElement | null,
  frameIndex: number
): Promise<ImageData | null> {
  if (frameSource) {
    return await extractImageDataFromFrameSource(frameSource, frameIndex);
  }

  if (videoElement && videoElement.readyState >= 2 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    }
  }

  return null;
}

/**
 * Runs multi-frame ZNCC + Sub-Pixel auto-tracking directly on any `UnifiedFrameSource`
 * (`AviHighSpeedLoader`, `QuickTimeMovSliceLoader`, `AnimatedGifLoader`, `ImageSequenceLoader`).
 */
export async function autoTrackSequenceOnFrameSource(
  frameSource: UnifiedFrameSource,
  startFrame: number,
  endFrame: number,
  stepSize: number,
  initialU: number,
  initialV: number,
  config: AutoTrackerConfig = DEFAULT_AUTO_TRACKER_CONFIG
): Promise<{ frame: number; u: number; v: number; znccScore: number }[]> {
  const firstFrameData = await extractImageDataFromFrameSource(frameSource, startFrame);
  if (!firstFrameData) return [];

  const { width, height } = firstFrameData;
  const firstLum = extractLuminanceBuffer(firstFrameData);
  let template = extractTemplatePatch(
    firstLum,
    width,
    height,
    initialU,
    initialV,
    config.templateRadius
  );

  const tracked: { frame: number; u: number; v: number; znccScore: number }[] = [
    { frame: startFrame, u: initialU, v: initialV, znccScore: 1.0 },
  ];

  let prevU = initialU;
  let prevV = initialV;
  let velU = 0;
  let velV = 0;
  const safeStep = Math.max(1, Math.floor(stepSize));

  for (let f = startFrame + safeStep; f <= endFrame; f += safeStep) {
    const imgData = await extractImageDataFromFrameSource(frameSource, f);
    if (!imgData) break;

    const lum = extractLuminanceBuffer(imgData);
    const predU = config.useVelocityPrediction ? prevU + velU : prevU;
    const predV = config.useVelocityPrediction ? prevV + velV : prevV;

    const match = matchTemplateZNCCSubPixel(template, lum, width, height, predU, predV, config);
    if (!match.matched) {
      break;
    }

    velU = match.u - prevU;
    velV = match.v - prevV;
    prevU = match.u;
    prevV = match.v;

    tracked.push({
      frame: f,
      u: match.u,
      v: match.v,
      znccScore: match.znccScore,
    });

    if (config.templateEvolutionRate > 0) {
      const newPatch = extractTemplatePatch(
        lum,
        width,
        height,
        match.u,
        match.v,
        config.templateRadius
      );
      template = evolveTemplatePatch(template, newPatch, config.templateEvolutionRate);
    }
  }

  return tracked;
}

/**
 * Backward-compatible alias accepting any `UnifiedFrameSource` (including `AviHighSpeedLoader`).
 */
export async function autoTrackSequenceOnAviLoader(
  aviLoader: UnifiedFrameSource,
  startFrame: number,
  endFrame: number,
  stepSize: number,
  initialU: number,
  initialV: number,
  config: AutoTrackerConfig = DEFAULT_AUTO_TRACKER_CONFIG
): Promise<{ frame: number; u: number; v: number; znccScore: number }[]> {
  return await autoTrackSequenceOnFrameSource(
    aviLoader,
    startFrame,
    endFrame,
    stepSize,
    initialU,
    initialV,
    config
  );
}
