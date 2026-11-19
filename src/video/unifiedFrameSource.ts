/**
 * Unified Multi-Format Media Frame Source Interface & Helpers
 *
 * Shared zero-copy / on-demand frame contract across:
 * - Tier 1A: RIFF / OpenDML .AVI (`AviHighSpeedLoader`)
 * - Tier 1B: QuickTime .MOV stbl slice (`QuickTimeMovSliceLoader`)
 * - Tier 1C: Animated GIF89a (`AnimatedGifLoader`)
 * - Tier 1D: Numbered Image Sequences, Zipped Image Sequences, Single Images & Clipboard Pastes (`ImageSequenceLoader`)
 *
 * All implementations enforce a bounded LRU ImageBitmap cache (<= 120 frames)
 * and release GPU textures via `bitmap.close()` on eviction and `dispose()`.
 */

export type FrameSourceKind =
  | 'avi'
  | 'mov'
  | 'gif'
  | 'image-sequence'
  | 'single-image';

export interface UnifiedFrameMetadata {
  fileName: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  isTopDown: boolean;
  bitCount: number;
  compressionFourCC: string;
  compressionCode: number;
  fps: number;
  totalFrames: number;
  durationSec: number;
  isOpenDML: boolean;
  indexType: 'opendml_indx' | 'legacy_idx1' | 'movi_header_scan' | 'gif_frames' | 'image_sequence';
  indexMemoryBytes: number;
  palette?: Uint8Array;
  sourceKind?: FrameSourceKind;
  timestampsSec?: Float64Array;
  isSingleFrame?: boolean;
}

export interface UnifiedFrameSource {
  metadata: UnifiedFrameMetadata | null;
  readonly width: number;
  readonly height: number;
  readonly totalFrames: number;
  readonly fps: number;
  readonly durationSec: number;
  readonly sourceKind: FrameSourceKind;
  initialize(): Promise<UnifiedFrameMetadata>;
  /** Primary unified frame accessor returning an ImageBitmap (or null in headless/Node environments). */
  getFrame(frameIndex: number): Promise<ImageBitmap | null>;
  /** Legacy alias for getFrame(frameIndex). */
  getFrameBitmap(frameIndex: number): Promise<ImageBitmap | null>;
  /** RGBA ImageData accessor for pixel-exact ZNCC auto-tracking and headless verification. */
  getFrameImageData(frameIndex: number): Promise<ImageData | null>;
  /** Returns strictly monotonic presentation timestamp in seconds for frameIndex. */
  getFrameTimestampSec?(frameIndex: number): number;
  /** Synchronously releases all cached GPU ImageBitmaps (`bitmap.close()`) and buffers. */
  dispose(): void;
}

export interface CodecDiagnosticNotice {
  fileName: string;
  container: string;
  codecFourCC: string;
  signatureHex?: string;
  width?: number;
  height?: number;
  fps?: number;
  reason: string;
  ffmpegCommand: string;
  electronHint: string;
}

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'bmp',
  'webp',
]);

export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/bmp',
  'image/x-ms-bmp',
  'image/webp',
]);

export function getFileExtension(fileName: string): string {
  const clean = fileName.split(/[\\/]/).pop() || fileName;
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
}

export function getFileBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

export function isGifFile(file: { name: string; type?: string }): boolean {
  const ext = getFileExtension(file.name);
  return ext === 'gif' || file.type?.toLowerCase() === 'image/gif';
}

export function isImageFile(file: { name: string; type?: string }): boolean {
  const ext = getFileExtension(file.name);
  if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) return true;
  if (file.type && SUPPORTED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) return true;
  return false;
}

/**
 * Validates whether a path inside a folder or ZIP archive is a real image sequence frame.
 * Strictly rejects:
 * - macOS resource fork folders (`__MACOSX/`)
 * - Hidden dotfiles (`basename.startsWith('.')`, e.g. `._frame_0001.png`, `.DS_Store`)
 * - Non-image extensions
 */
export function isValidSequenceImagePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized || normalized.endsWith('/')) return false;
  if (/(^|\/)__MACOSX(\/|$)/i.test(normalized)) return false;

  const segments = normalized.split('/');
  for (const seg of segments) {
    if (!seg) continue;
    if (seg.startsWith('.')) return false;
  }

  const basename = segments[segments.length - 1] || '';
  if (!basename || basename.startsWith('.')) return false;

  const ext = getFileExtension(basename);
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext);
}

/**
 * Natural numeric comparator (`frame_2.png` < `frame_10.png`).
 */
export function naturalCompareFilenames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Builds a copy-ready, range-safety all-intra H.264 FFmpeg transcode command for
 * legacy containers/codecs that cannot be decoded natively in a plain browser.
 */
export function buildFfmpegTranscodeCommand(fileName: string): string {
  const safeInput = (fileName || 'input_video.avi').replace(/"/g, '\\"');
  const baseName = safeInput.replace(/\.[^.]+$/, '') || 'converted_video';
  return `ffmpeg -i "${safeInput}" -c:v libx264 -preset fast -crf 18 -g 1 -pix_fmt yuv420p "${baseName}_allintra.mp4"`;
}

/**
 * Extracts RGBA `ImageData` from an `ImageBitmap` via a reusable offscreen canvas.
 */
let sharedScratchCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

export function extractImageDataFromBitmap(bitmap: ImageBitmap): ImageData | null {
  const width = bitmap.width;
  const height = bitmap.height;
  if (!width || !height) return null;

  if (typeof OffscreenCanvas !== 'undefined') {
    if (!sharedScratchCanvas || !(sharedScratchCanvas instanceof OffscreenCanvas)) {
      sharedScratchCanvas = new OffscreenCanvas(width, height);
    }
    if (sharedScratchCanvas.width !== width || sharedScratchCanvas.height !== height) {
      sharedScratchCanvas.width = width;
      sharedScratchCanvas.height = height;
    }
    const ctx = sharedScratchCanvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height);
    }
  }

  if (typeof document !== 'undefined') {
    if (!sharedScratchCanvas || typeof (sharedScratchCanvas as HTMLCanvasElement).getContext !== 'function') {
      sharedScratchCanvas = document.createElement('canvas');
    }
    if (sharedScratchCanvas.width !== width || sharedScratchCanvas.height !== height) {
      sharedScratchCanvas.width = width;
      sharedScratchCanvas.height = height;
    }
    const ctx = (sharedScratchCanvas as HTMLCanvasElement).getContext('2d', {
      willReadFrequently: true,
    });
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height);
    }
  }

  return null;
}

/**
 * Unified pixel-sampling helper for ZNCC sub-pixel auto-tracking and viewport inspection.
 * Fetches frame pixels directly via `await frameSource.getFrame(frameIndex)` drawn to an
 * offscreen canvas for `getImageData`, with automatic fallback to `getFrameImageData(frameIndex)`
 * in headless/Node environments where `ImageBitmap` / Canvas2D is unavailable.
 */
export async function extractImageDataFromFrameSource(
  source: UnifiedFrameSource,
  frameIndex: number
): Promise<ImageData | null> {
  if (typeof source.getFrame === 'function') {
    try {
      const bitmap = await source.getFrame(frameIndex);
      if (bitmap) {
        const imgData = extractImageDataFromBitmap(bitmap);
        if (imgData) return imgData;
      }
    } catch {
      // Fallback to direct ImageData path
    }
  }

  if (typeof source.getFrameImageData === 'function') {
    return await source.getFrameImageData(frameIndex);
  }

  return null;
}
