/**
 * Lazy Image Sequence & Single-Image Unified Frame Source (`ImageSequenceLoader`)
 *
 * Supports:
 * 1. Single image (`File | Blob`, including `Ctrl+V` clipboard pastes) -> 1-frame calibratable source (`totalFrames = 1`)
 * 2. Multi-file numbered image sequences (`File[]`, `.png`, `.jpg`, `.jpeg`, `.bmp`, `.webp`)
 *    sorted naturally (`frame_2.png` before `frame_10.png`)
 * 3. Lazy `.zip` image sequence archives (`JSZipObject[]`), strictly ignoring:
 *    - directory entries (`entry.dir === true`)
 *    - `__MACOSX/` paths
 *    - hidden dotfiles (`basename.startsWith('.')`, e.g. `._frame_0001.png`)
 *    - 0-byte entries
 *
 * Memory & GPU Safety:
 * - Keeps `File` / `JSZipObject` references LAZY (never pre-decodes all frames into RAM upfront).
 * - Decodes on-demand inside `getFrame(i)` with a bounded 120-frame LRU `ImageBitmap` cache.
 * - Explicitly invokes `bitmap.close()` whenever an entry is evicted from the LRU cache or inside `dispose()`.
 */

import type JSZip from 'jszip';
import {
  extractImageDataFromBitmap,
  getFileExtension,
  isValidSequenceImagePath,
  naturalCompareFilenames,
  UnifiedFrameMetadata,
  UnifiedFrameSource,
} from './unifiedFrameSource';

const MAX_LRU_FRAMES = 120;
const DEFAULT_SEQUENCE_FPS = 30;

export interface LazyZipImageEntry {
  path: string;
  name: string;
  zipObject: JSZip.JSZipObject;
}

type LazyFrameDescriptor =
  | { kind: 'blob'; name: string; blob: File | Blob; mimeType: string }
  | { kind: 'zip'; name: string; path: string; zipObject: JSZip.JSZipObject; mimeType: string };

function inferImageMimeType(fileName: string, fallbackType?: string): string {
  if (fallbackType && fallbackType.startsWith('image/')) return fallbackType;
  const ext = getFileExtension(fileName);
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'bmp':
      return 'image/bmp';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

/**
 * Inspects a JSZip archive and returns strictly filtered, naturally-sorted lazy image entries.
 * Ignores directory entries, `__MACOSX/`, dotfiles (`._*`, `.*`), non-image extensions, and 0-byte entries.
 */
export async function filterAndSortZipImageEntries(zip: JSZip): Promise<LazyZipImageEntry[]> {
  const candidates: LazyZipImageEntry[] = [];

  for (const [entryPath, zipObj] of Object.entries(zip.files)) {
    if (zipObj.dir) continue;
    if (!isValidSequenceImagePath(entryPath)) continue;

    // Fast 0-byte check via JSZip internal metadata if available
    const internalData = (zipObj as any)._data;
    if (
      internalData &&
      typeof internalData.uncompressedSize === 'number' &&
      internalData.uncompressedSize === 0
    ) {
      continue;
    }

    const basename = entryPath.replace(/\\/g, '/').split('/').pop() || entryPath;
    candidates.push({
      path: entryPath,
      name: basename,
      zipObject: zipObj,
    });
  }

  candidates.sort((a, b) => naturalCompareFilenames(a.path, b.path));

  // Verify 0-byte entries if JSZip did not expose uncompressedSize synchronously
  // Only check uncompressed size lazily when needed; if _data is missing, probe byteLength safely
  const verified: LazyZipImageEntry[] = [];
  for (const entry of candidates) {
    const internalData = (entry.zipObject as any)._data;
    if (internalData && typeof internalData.uncompressedSize === 'number') {
      if (internalData.uncompressedSize > 0) {
        verified.push(entry);
      }
      continue;
    }
    try {
      const bytes = await entry.zipObject.async('uint8array');
      if (bytes.byteLength > 0) {
        verified.push(entry);
      }
    } catch {
      // Skip unreadable entry
    }
  }

  return verified;
}

/**
 * Parses natural pixel dimensions from PNG / JPEG / BMP / WebP binary headers
 * (essential fallback in headless / Node / Vitest environments where `createImageBitmap` is absent).
 */
function parseImageHeaderDimensions(buf: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A ... IHDR at offset 16 (width uint32 BE, height uint32 BE)
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const w = view.getUint32(16, false);
    const h = view.getUint32(20, false);
    if (w > 0 && h > 0 && w <= 32768 && h <= 32768) {
      return { width: w, height: h };
    }
  }

  // 2. BMP: 42 4D ... DIB header width at 18, height at 22 (int32 LE)
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const w = view.getInt32(18, true);
    const h = Math.abs(view.getInt32(22, true));
    if (w > 0 && h > 0 && w <= 32768 && h <= 32768) {
      return { width: w, height: h };
    }
  }

  // 3. JPEG: FF D8 ... scan for SOF0..SOF2 markers (FF C0 / FF C1 / FF C2)
  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) {
        pos++;
        continue;
      }
      const marker = bytes[pos + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const h = view.getUint16(pos + 5, false);
        const w = view.getUint16(pos + 7, false);
        if (w > 0 && h > 0) return { width: w, height: h };
        break;
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const segLen = view.getUint16(pos + 2, false);
      if (segLen < 2) break;
      pos += 2 + segLen;
    }
  }

  // 4. WebP: RIFF .... WEBP
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      if (w > 0 && h > 0) return { width: w, height: h };
    } else if (chunk === 'VP8 ' && bytes.length >= 30) {
      const w = view.getUint16(26, true) & 0x3fff;
      const h = view.getUint16(28, true) & 0x3fff;
      if (w > 0 && h > 0) return { width: w, height: h };
    } else if (chunk === 'VP8L' && bytes.length >= 25) {
      const bits = view.getUint32(21, true);
      const w = (bits & 0x3fff) + 1;
      const h = ((bits >> 14) & 0x3fff) + 1;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }

  return null;
}

/**
 * Pure-TS uncompressed 24/32-bit BMP decoder fallback so headless Vitest tests can
 * also decode real pixel data from BMP frames without needing a browser canvas.
 */
function tryDecodeBmpToImageData(buf: ArrayBuffer): ImageData | null {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;

  const pixelOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const height = Math.abs(rawHeight);
  const isTopDown = rawHeight < 0;
  const bpp = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (compression !== 0 || (bpp !== 24 && bpp !== 32) || width <= 0 || height <= 0) {
    return null;
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  const bytesPerPixel = bpp / 8;
  const rowStride = ((width * bytesPerPixel + 3) & ~3);

  for (let y = 0; y < height; y++) {
    const srcRow = isTopDown ? y : height - 1 - y;
    const srcStart = pixelOffset + srcRow * rowStride;
    const dstStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcStart + x * bytesPerPixel;
      const d = dstStart + x * 4;
      if (s + 2 < bytes.length) {
        rgba[d] = bytes[s + 2]; // R
        rgba[d + 1] = bytes[s + 1]; // G
        rgba[d + 2] = bytes[s]; // B
        rgba[d + 3] = bpp === 32 && s + 3 < bytes.length ? bytes[s + 3] : 255;
      }
    }
  }

  return typeof ImageData !== 'undefined'
    ? new ImageData(rgba, width, height)
    : ({ data: rgba, width, height, colorSpace: 'srgb' } as ImageData);
}

export class ImageSequenceLoader implements UnifiedFrameSource {
  public readonly sourceKind: 'image-sequence' | 'single-image';
  public metadata: UnifiedFrameMetadata | null = null;

  private descriptors: LazyFrameDescriptor[];
  private displayName: string;
  private initialFps: number;
  private bitmapCache = new Map<number, ImageBitmap>();
  private imageDataCache = new Map<number, ImageData>();
  private readonly maxCacheFrames: number;

  private constructor(
    descriptors: LazyFrameDescriptor[],
    displayName: string,
    sourceKind: 'image-sequence' | 'single-image',
    fps = DEFAULT_SEQUENCE_FPS,
    maxCacheFrames = MAX_LRU_FRAMES
  ) {
    this.descriptors = descriptors;
    this.displayName = displayName;
    this.sourceKind = sourceKind;
    this.initialFps = fps > 0 ? fps : DEFAULT_SEQUENCE_FPS;
    this.maxCacheFrames = Math.max(4, Math.min(MAX_LRU_FRAMES, maxCacheFrames));
  }

  public static fromSingleImage(
    file: File | Blob,
    fileName?: string,
    fps = DEFAULT_SEQUENCE_FPS
  ): ImageSequenceLoader {
    const name = fileName || (file instanceof File ? file.name : 'pasted_image.png');
    const mimeType = inferImageMimeType(name, file.type);
    return new ImageSequenceLoader(
      [{ kind: 'blob', name, blob: file, mimeType }],
      name,
      'single-image',
      fps
    );
  }

  public static fromFiles(
    files: File[],
    fps = DEFAULT_SEQUENCE_FPS,
    maxCacheFrames = MAX_LRU_FRAMES
  ): ImageSequenceLoader {
    const validFiles = files
      .filter((f) => f.size > 0 && isValidSequenceImagePath(f.name))
      .sort((a, b) => naturalCompareFilenames(a.name, b.name));

    if (validFiles.length === 0) {
      throw new Error('No valid image files (.png, .jpg, .bmp, .webp) were provided.');
    }

    const descriptors: LazyFrameDescriptor[] = validFiles.map((f) => ({
      kind: 'blob',
      name: f.name,
      blob: f,
      mimeType: inferImageMimeType(f.name, f.type),
    }));

    const isSingle = descriptors.length === 1;
    const displayName = isSingle
      ? descriptors[0].name
      : `${descriptors[0].name} (${descriptors.length} frames)`;

    return new ImageSequenceLoader(
      descriptors,
      displayName,
      isSingle ? 'single-image' : 'image-sequence',
      fps,
      maxCacheFrames
    );
  }

  public static fromLazyZipEntries(
    entries: LazyZipImageEntry[],
    archiveName: string,
    fps = DEFAULT_SEQUENCE_FPS,
    maxCacheFrames = MAX_LRU_FRAMES
  ): ImageSequenceLoader {
    const valid = entries
      .filter((e) => !e.zipObject.dir && isValidSequenceImagePath(e.path))
      .sort((a, b) => naturalCompareFilenames(a.path, b.path));

    if (valid.length === 0) {
      throw new Error(`Archive "${archiveName}" contains no valid image sequence frames.`);
    }

    const descriptors: LazyFrameDescriptor[] = valid.map((e) => ({
      kind: 'zip',
      name: e.name,
      path: e.path,
      zipObject: e.zipObject,
      mimeType: inferImageMimeType(e.name),
    }));

    const isSingle = descriptors.length === 1;
    return new ImageSequenceLoader(
      descriptors,
      archiveName,
      isSingle ? 'single-image' : 'image-sequence',
      fps,
      maxCacheFrames
    );
  }

  public get width(): number {
    return this.metadata?.width ?? 0;
  }

  public get height(): number {
    return this.metadata?.height ?? 0;
  }

  public get totalFrames(): number {
    return this.metadata?.totalFrames ?? this.descriptors.length;
  }

  public get fps(): number {
    return this.metadata?.fps ?? this.initialFps;
  }

  public get durationSec(): number {
    return this.metadata?.durationSec ?? 0;
  }

  public getFrameNames(): string[] {
    return this.descriptors.map((d) => d.name);
  }

  public getFrameTimestampSec(frameIndex: number): number {
    const safeFps = this.fps > 0 ? this.fps : DEFAULT_SEQUENCE_FPS;
    const idx = Math.max(0, Math.min(Math.max(0, this.descriptors.length - 1), Math.floor(frameIndex)));
    return idx / safeFps;
  }

  private async resolveBlob(frameIndex: number): Promise<Blob | null> {
    const desc = this.descriptors[frameIndex];
    if (!desc) return null;
    if (desc.kind === 'blob') {
      return desc.blob;
    }
    const bytes = await desc.zipObject.async('uint8array');
    if (bytes.byteLength === 0) return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy], { type: desc.mimeType });
  }

  public async initialize(): Promise<UnifiedFrameMetadata> {
    if (this.descriptors.length === 0) {
      throw new Error('Cannot initialize an empty image sequence.');
    }

    // Lazily inspect ONLY frame 0 to determine exact dimensions (never pre-decode all frames!)
    let width = 640;
    let height = 480;
    let totalSizeBytes = 0;

    for (const d of this.descriptors) {
      if (d.kind === 'blob') {
        totalSizeBytes += d.blob.size;
      } else {
        const internalSize = (d.zipObject as any)._data?.uncompressedSize;
        if (typeof internalSize === 'number') totalSizeBytes += internalSize;
      }
    }

    const firstBlob = await this.resolveBlob(0);
    if (firstBlob) {
      if (typeof createImageBitmap === 'function') {
        try {
          const bmp0 = await createImageBitmap(firstBlob);
          width = bmp0.width || width;
          height = bmp0.height || height;
          this.cacheBitmap(0, bmp0);
        } catch {
          const buf = await firstBlob.arrayBuffer();
          const dims = parseImageHeaderDimensions(buf);
          if (dims) {
            width = dims.width;
            height = dims.height;
          }
        }
      } else {
        const buf = await firstBlob.arrayBuffer();
        const dims = parseImageHeaderDimensions(buf);
        if (dims) {
          width = dims.width;
          height = dims.height;
        }
      }
    }

    const totalFrames = this.descriptors.length;
    const fps = this.initialFps;
    const durationSec = totalFrames / fps;
    const isSingleFrame = totalFrames === 1;

    this.metadata = {
      fileName: this.displayName,
      fileSizeBytes: totalSizeBytes,
      width,
      height,
      isTopDown: true,
      bitCount: 32,
      compressionFourCC: isSingleFrame ? 'IMG ' : 'SEQ ',
      compressionCode: 0,
      fps,
      totalFrames,
      durationSec,
      isOpenDML: false,
      indexType: 'image_sequence',
      indexMemoryBytes: totalFrames * 64,
      sourceKind: this.sourceKind,
      isSingleFrame,
    };

    return this.metadata;
  }

  public async getFrame(frameIndex: number): Promise<ImageBitmap | null> {
    return await this.getFrameBitmap(frameIndex);
  }

  public async getFrameBitmap(frameIndex: number): Promise<ImageBitmap | null> {
    if (this.descriptors.length === 0) return null;
    const idx = Math.max(0, Math.min(this.descriptors.length - 1, Math.floor(frameIndex)));

    const cached = this.bitmapCache.get(idx);
    if (cached) {
      this.bitmapCache.delete(idx);
      this.bitmapCache.set(idx, cached);
      return cached;
    }

    if (typeof createImageBitmap !== 'function') {
      return null;
    }

    const blob = await this.resolveBlob(idx);
    if (!blob) return null;

    try {
      const bmp = await createImageBitmap(blob);
      this.cacheBitmap(idx, bmp);
      return bmp;
    } catch {
      return null;
    }
  }

  public async getFrameImageData(frameIndex: number): Promise<ImageData | null> {
    if (this.descriptors.length === 0) return null;
    const idx = Math.max(0, Math.min(this.descriptors.length - 1, Math.floor(frameIndex)));

    const cached = this.imageDataCache.get(idx);
    if (cached) {
      this.imageDataCache.delete(idx);
      this.imageDataCache.set(idx, cached);
      return cached;
    }

    const bmp = await this.getFrameBitmap(idx);
    if (bmp) {
      const imgData = extractImageDataFromBitmap(bmp);
      if (imgData) {
        this.cacheImageData(idx, imgData);
        return imgData;
      }
    }

    // Fallback for headless / Node environments (e.g. uncompressed BMP test fixtures)
    const blob = await this.resolveBlob(idx);
    if (blob) {
      const buf = await blob.arrayBuffer();
      const bmpData = tryDecodeBmpToImageData(buf);
      if (bmpData) {
        this.cacheImageData(idx, bmpData);
        return bmpData;
      }
    }

    return null;
  }

  private cacheBitmap(frameIdx: number, bmp: ImageBitmap): void {
    this.bitmapCache.set(frameIdx, bmp);
    while (this.bitmapCache.size > this.maxCacheFrames) {
      const oldestKey = this.bitmapCache.keys().next().value;
      if (oldestKey === undefined) break;
      const evicted = this.bitmapCache.get(oldestKey);
      this.bitmapCache.delete(oldestKey);
      if (evicted && typeof evicted.close === 'function') {
        try {
          evicted.close();
        } catch {
          // ignore
        }
      }
    }
  }

  private cacheImageData(frameIdx: number, imgData: ImageData): void {
    this.imageDataCache.set(frameIdx, imgData);
    while (this.imageDataCache.size > this.maxCacheFrames) {
      const oldestKey = this.imageDataCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.imageDataCache.delete(oldestKey);
    }
  }

  public dispose(): void {
    for (const bmp of this.bitmapCache.values()) {
      if (typeof bmp.close === 'function') {
        try {
          bmp.close();
        } catch {
          // ignore
        }
      }
    }
    this.bitmapCache.clear();
    this.imageDataCache.clear();
  }
}

/**
 * Helper utility to construct a valid minimal 24-bit uncompressed BMP Blob in memory
 * for deterministic unit testing of image sequences, ZIP sequences, clipboard pastes, and ZNCC tracking.
 */
export function createSyntheticBmpBlob(options: {
  width?: number;
  height?: number;
  targetX?: number;
  targetY?: number;
  bgColor?: [number, number, number];
  fgColor?: [number, number, number];
} = {}): Blob {
  const width = options.width ?? 32;
  const height = options.height ?? 32;
  const targetX = options.targetX ?? 12;
  const targetY = options.targetY ?? 12;
  const bg = options.bgColor ?? [20, 24, 32];
  const fg = options.fgColor ?? [245, 245, 250];

  const rowStride = (width * 3 + 3) & ~3;
  const pixelArraySize = rowStride * height;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // BITMAPFILEHEADER (14 bytes)
  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, pixelArraySize, true);

  for (let y = 0; y < height; y++) {
    const rowOff = 54 + y * rowStride;
    for (let x = 0; x < width; x++) {
      const dist = Math.hypot(x - targetX, y - targetY);
      const isTarget = dist <= 3.2;
      const off = rowOff + x * 3;
      if (isTarget) {
        const w = Math.max(0, 1 - dist / 4);
        bytes[off] = Math.round(bg[2] + (fg[2] - bg[2]) * w); // B
        bytes[off + 1] = Math.round(bg[1] + (fg[1] - bg[1]) * w); // G
        bytes[off + 2] = Math.round(bg[0] + (fg[0] - bg[0]) * w); // R
      } else {
        bytes[off] = bg[2];
        bytes[off + 1] = bg[1];
        bytes[off + 2] = bg[0];
      }
    }
  }

  return new Blob([buf], { type: 'image/bmp' });
}

/**
 * Helper utility to construct a valid minimal PNG header Blob (with IHDR dimensions)
 * for unit testing PNG sequence ordering and ZIP archive scanning.
 */
export function createMinimalPngHeaderBlob(width = 64, height = 48): Blob {
  const buf = new ArrayBuffer(33);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  // PNG magic signature
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk length = 13
  view.setUint32(8, 13, false);
  // 'IHDR'
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = 8; // bit depth
  bytes[25] = 2; // RGB color type
  return new Blob([buf], { type: 'image/png' });
}
