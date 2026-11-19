/**
 * Frame-Accurate Animated GIF89a Loader (`AnimatedGifLoader`)
 *
 * Replaces the legacy hardcoded 60-frame `<img>` workaround with exact GIF frame
 * extraction, per-frame disposal compositing, strictly monotonic timestamps, and
 * a GPU-safe 120-frame LRU `ImageBitmap` cache.
 *
 * Decoding Pipeline:
 * 1. Primary (Chromium): WebCodecs `ImageDecoder({ data, type: 'image/gif' })`
 * 2. Pure-TypeScript GIF87a / GIF89a LZW + Disposal Fallback (for Safari, Firefox,
 *    and headless Vitest / Node environments).
 *
 * Safety Guarantees:
 * - Any 0 ms frame delay is clamped to 100 ms (or 1000/30 ms if all frames report 0 ms)
 *   so per-frame timestamps are strictly monotonic (`t[i] > t[i-1]`) with zero `dt = 0`
 *   kinematic singularities.
 * - Static 1-frame GIFs expose `totalFrames = 1` cleanly without division-by-zero.
 * - Every evicted or disposed `ImageBitmap` explicitly invokes `bitmap.close()`.
 */

import {
  UnifiedFrameMetadata,
  UnifiedFrameSource,
} from './unifiedFrameSource';

const MAX_LRU_FRAMES = 120;
const DEFAULT_FALLBACK_FPS = 30;
const ZERO_DELAY_CLAMP_MS = 100;

interface ParsedGifFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  interlaced: boolean;
  disposalMethod: number; // 0: none, 1: keep, 2: restore background, 3: restore previous
  hasTransparency: boolean;
  transparentIndex: number;
  delayMs: number;
  colorTable: Uint8Array;
  minCodeSize: number;
  lzwData: Uint8Array;
}

interface ParsedGifContainer {
  width: number;
  height: number;
  backgroundColorIndex: number;
  globalColorTable: Uint8Array;
  frames: ParsedGifFrame[];
}

function createImageDataSafe(rgba: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') {
    const copy = new Uint8ClampedArray(rgba);
    return new ImageData(copy, width, height);
  }
  return {
    data: new Uint8ClampedArray(rgba),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

/**
 * Pure-TypeScript GIF87a / GIF89a binary parser.
 */
function parseGifBinary(buffer: ArrayBuffer): ParsedGifContainer {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  if (len < 13) {
    throw new Error('Invalid GIF file: truncated header.');
  }

  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') {
    throw new Error(`Invalid GIF signature: "${sig}".`);
  }

  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  const packed = bytes[10];
  const bgIndex = bytes[11];

  const hasGct = (packed & 0x80) !== 0;
  const gctSize = hasGct ? 1 << ((packed & 0x07) + 1) : 0;

  let pos = 13;
  let globalColorTable = new Uint8Array(0);
  if (hasGct) {
    const byteLen = gctSize * 3;
    if (pos + byteLen > len) {
      throw new Error('Invalid GIF file: truncated Global Color Table.');
    }
    globalColorTable = bytes.slice(pos, pos + byteLen);
    pos += byteLen;
  }

  const readSubBlocks = (): Uint8Array => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (pos < len) {
      const blockSize = bytes[pos++];
      if (blockSize === 0) break;
      const end = Math.min(len, pos + blockSize);
      const slice = bytes.subarray(pos, end);
      chunks.push(slice);
      total += slice.length;
      pos = end;
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    return merged;
  };

  const skipSubBlocks = () => {
    while (pos < len) {
      const blockSize = bytes[pos++];
      if (blockSize === 0) break;
      pos = Math.min(len, pos + blockSize);
    }
  };

  const frames: ParsedGifFrame[] = [];

  // Current Graphic Control Extension state (applies to next image descriptor)
  let gceDisposal = 0;
  let gceHasTrans = false;
  let gceTransIndex = 0;
  let gceDelayMs = 0;

  while (pos < len) {
    const introducer = bytes[pos++];
    if (introducer === 0x3b) {
      // GIF Trailer
      break;
    } else if (introducer === 0x21) {
      // Extension block
      if (pos >= len) break;
      const label = bytes[pos++];
      if (label === 0xf9 && pos + 5 <= len) {
        // Graphic Control Extension
        const blockSize = bytes[pos++];
        if (blockSize >= 4 && pos + blockSize <= len) {
          const gcePacked = bytes[pos];
          gceDisposal = (gcePacked >> 2) & 0x07;
          gceHasTrans = (gcePacked & 0x01) !== 0;
          const delayCs = bytes[pos + 1] | (bytes[pos + 2] << 8);
          gceDelayMs = delayCs * 10;
          gceTransIndex = bytes[pos + 3];
          pos += blockSize;
          // Skip block terminator (0x00)
          if (pos < len && bytes[pos] === 0) pos++;
        } else {
          pos += blockSize;
          skipSubBlocks();
        }
      } else {
        skipSubBlocks();
      }
    } else if (introducer === 0x2c) {
      // Image Descriptor
      if (pos + 9 > len) break;
      const left = bytes[pos] | (bytes[pos + 1] << 8);
      const top = bytes[pos + 2] | (bytes[pos + 3] << 8);
      const frameW = bytes[pos + 4] | (bytes[pos + 5] << 8);
      const frameH = bytes[pos + 6] | (bytes[pos + 7] << 8);
      const imgPacked = bytes[pos + 8];
      pos += 9;

      const hasLct = (imgPacked & 0x80) !== 0;
      const interlaced = (imgPacked & 0x40) !== 0;
      const lctSize = hasLct ? 1 << ((imgPacked & 0x07) + 1) : 0;

      let colorTable = globalColorTable;
      if (hasLct) {
        const byteLen = lctSize * 3;
        if (pos + byteLen > len) break;
        colorTable = bytes.slice(pos, pos + byteLen);
        pos += byteLen;
      }

      if (pos >= len) break;
      const minCodeSize = bytes[pos++];
      const lzwData = readSubBlocks();

      frames.push({
        left,
        top,
        width: frameW,
        height: frameH,
        interlaced,
        disposalMethod: gceDisposal,
        hasTransparency: gceHasTrans,
        transparentIndex: gceTransIndex,
        delayMs: gceDelayMs,
        colorTable,
        minCodeSize,
        lzwData,
      });

      // Reset GCE state for next frame
      gceDisposal = 0;
      gceHasTrans = false;
      gceTransIndex = 0;
      gceDelayMs = 0;
    } else {
      // Unknown/padding byte
      continue;
    }
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    backgroundColorIndex: bgIndex,
    globalColorTable,
    frames,
  };
}

/**
 * Pure-TypeScript GIF LZW Decompressor (RFC/GIF89a compliant, up to 12-bit codes).
 */
function decompressGifLzw(
  minCodeSize: number,
  data: Uint8Array,
  expectedPixels: number
): Uint8Array {
  const out = new Uint8Array(expectedPixels);
  if (minCodeSize < 2 || minCodeSize > 11 || data.length === 0) return out;

  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4096);

  let codeSize = minCodeSize + 1;
  let codeMask = (1 << codeSize) - 1;
  let available = eoiCode + 1;
  let oldCode = -1;
  let first = 0;

  for (let i = 0; i < clearCode; i++) {
    prefix[i] = 0;
    suffix[i] = i;
  }

  let bitPos = 0;
  const totalBits = data.length * 8;
  let outPos = 0;

  const readCode = (): number => {
    if (bitPos + codeSize > totalBits) return -1;
    let byteIdx = bitPos >> 3;
    let bitOffset = bitPos & 7;
    let raw = data[byteIdx];
    if (byteIdx + 1 < data.length) raw |= data[byteIdx + 1] << 8;
    if (byteIdx + 2 < data.length) raw |= data[byteIdx + 2] << 16;
    bitPos += codeSize;
    return (raw >> bitOffset) & codeMask;
  };

  while (outPos < expectedPixels) {
    const code = readCode();
    if (code < 0 || code === eoiCode) break;

    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      codeMask = (1 << codeSize) - 1;
      available = eoiCode + 1;
      oldCode = -1;
      continue;
    }

    if (oldCode === -1) {
      if (code < clearCode) {
        out[outPos++] = suffix[code];
        first = code;
        oldCode = code;
      }
      continue;
    }

    let inCode = code;
    let stackTop = 0;

    if (code >= available) {
      stack[stackTop++] = first;
      inCode = oldCode;
    }

    while (inCode >= clearCode && stackTop < 4096) {
      stack[stackTop++] = suffix[inCode];
      inCode = prefix[inCode];
    }

    first = suffix[inCode];
    if (outPos < expectedPixels) {
      out[outPos++] = first;
    }

    while (stackTop > 0 && outPos < expectedPixels) {
      out[outPos++] = stack[--stackTop];
    }

    if (available < 4096) {
      prefix[available] = oldCode;
      suffix[available] = first;
      available++;
      if ((available & codeMask) === 0 && available < 4096 && codeSize < 12) {
        codeSize++;
        codeMask = (1 << codeSize) - 1;
      }
    }

    oldCode = code;
  }

  return out;
}

/**
 * Normalizes GIF frame delays into strictly positive durations (ms) and strictly
 * monotonic timestamps (seconds) so `dt > 0` holds for every adjacent frame pair.
 */
export function buildMonotonicGifTimeline(rawDelaysMs: number[]): {
  delaysMs: number[];
  timestampsSec: Float64Array;
  effectiveFps: number;
  durationSec: number;
} {
  const count = Math.max(1, rawDelaysMs.length);
  const allZeroOrInvalid = rawDelaysMs.every((d) => !Number.isFinite(d) || d <= 0);
  const zeroFallbackMs = allZeroOrInvalid ? 1000 / DEFAULT_FALLBACK_FPS : ZERO_DELAY_CLAMP_MS;

  const delaysMs = new Array<number>(count);
  const timestampsSec = new Float64Array(count);

  let cumulativeSec = 0;
  let totalDelayMs = 0;

  for (let i = 0; i < count; i++) {
    const raw = rawDelaysMs[i] ?? 0;
    const clampedMs = Number.isFinite(raw) && raw > 0 ? Math.max(10, raw) : zeroFallbackMs;
    delaysMs[i] = clampedMs;
    timestampsSec[i] = cumulativeSec;
    cumulativeSec += clampedMs / 1000;
    totalDelayMs += clampedMs;
  }

  const avgDelaySec = Math.max(1 / 1000, totalDelayMs / count / 1000);
  const effectiveFps =
    count === 1
      ? DEFAULT_FALLBACK_FPS
      : Math.round((1 / avgDelaySec) * 100) / 100;
  const durationSec = Math.max(1 / DEFAULT_FALLBACK_FPS, cumulativeSec);

  return { delaysMs, timestampsSec, effectiveFps, durationSec };
}

export class AnimatedGifLoader implements UnifiedFrameSource {
  public readonly sourceKind = 'gif' as const;
  public metadata: UnifiedFrameMetadata | null = null;

  private file: File | Blob;
  private fileName: string;
  private parsed: ParsedGifContainer | null = null;
  private imageDecoder: any | null = null;
  private useImageDecoder = false;
  private timestampsSec: Float64Array = new Float64Array(1);
  private delaysMs: number[] = [1000 / DEFAULT_FALLBACK_FPS];

  private bitmapCache = new Map<number, ImageBitmap>();
  private imageDataCache = new Map<number, ImageData>();
  private readonly maxCacheFrames: number;

  // Persistent composition state for pure-TS GIF89a decoder
  private lastCompositedIdx = -1;
  private canvasBuffer: Uint8ClampedArray | null = null;
  private previousCanvasBuffer: Uint8ClampedArray | null = null;

  constructor(file: File | Blob, fileName = 'animation.gif', maxCacheFrames = MAX_LRU_FRAMES) {
    this.file = file;
    this.fileName = file instanceof File ? file.name : fileName;
    this.maxCacheFrames = Math.max(8, Math.min(MAX_LRU_FRAMES, maxCacheFrames));
  }

  public get width(): number {
    return this.metadata?.width ?? 0;
  }

  public get height(): number {
    return this.metadata?.height ?? 0;
  }

  public get totalFrames(): number {
    return this.metadata?.totalFrames ?? 0;
  }

  public get fps(): number {
    return this.metadata?.fps ?? DEFAULT_FALLBACK_FPS;
  }

  public get durationSec(): number {
    return this.metadata?.durationSec ?? 0;
  }

  public getFrameTimestampSec(frameIndex: number): number {
    if (this.timestampsSec.length === 0) return 0;
    const idx = Math.max(0, Math.min(this.timestampsSec.length - 1, Math.floor(frameIndex)));
    return this.timestampsSec[idx] ?? 0;
  }

  public async initialize(): Promise<UnifiedFrameMetadata> {
    const buffer =
      typeof this.file.arrayBuffer === 'function'
        ? await this.file.arrayBuffer()
        : await new Response(this.file).arrayBuffer();

    // Always parse the GIF binary header/frames cleanly (fast, deterministic, gives exact delays & fallback)
    this.parsed = parseGifBinary(buffer);
    const frameCount = Math.max(1, this.parsed.frames.length);

    // Check if Chromium WebCodecs ImageDecoder is available for hardware-accelerated GIF frame decoding
    const ImageDecoderCtor =
      typeof globalThis !== 'undefined' ? (globalThis as any).ImageDecoder : undefined;

    const rawDelaysMs: number[] = this.parsed.frames.map((f) => f.delayMs);

    if (ImageDecoderCtor && typeof ImageDecoderCtor.isTypeSupported === 'function') {
      try {
        const supported = await ImageDecoderCtor.isTypeSupported('image/gif');
        if (supported) {
          const decoder = new ImageDecoderCtor({
            data: new Uint8Array(buffer),
            type: 'image/gif',
          });
          await decoder.tracks.ready;
          const track = decoder.tracks.selectedTrack;
          const decoderFrameCount = track?.frameCount ?? frameCount;
          if (decoderFrameCount > 0) {
            this.imageDecoder = decoder;
            this.useImageDecoder = true;
            // If binary parser missed delays, sample from ImageDecoder frame 0
            if (rawDelaysMs.length === 0) {
              for (let i = 0; i < decoderFrameCount; i++) {
                rawDelaysMs.push(0);
              }
            }
          } else {
            decoder.close();
          }
        }
      } catch {
        this.useImageDecoder = false;
        this.imageDecoder = null;
      }
    }

    const timeline = buildMonotonicGifTimeline(
      rawDelaysMs.length > 0 ? rawDelaysMs : [0]
    );
    this.delaysMs = timeline.delaysMs;
    this.timestampsSec = timeline.timestampsSec;

    const totalFrames = Math.max(1, this.parsed.frames.length || timeline.delaysMs.length);
    const isSingleFrame = totalFrames === 1;

    this.metadata = {
      fileName: this.fileName,
      fileSizeBytes: this.file.size,
      width: this.parsed.width,
      height: this.parsed.height,
      isTopDown: true,
      bitCount: 32,
      compressionFourCC: 'GIF89a',
      compressionCode: 0,
      fps: timeline.effectiveFps,
      totalFrames,
      durationSec: timeline.durationSec,
      isOpenDML: false,
      indexType: 'gif_frames',
      indexMemoryBytes: totalFrames * 8,
      sourceKind: 'gif',
      timestampsSec: this.timestampsSec,
      isSingleFrame,
    };

    return this.metadata;
  }

  public async getFrame(frameIndex: number): Promise<ImageBitmap | null> {
    return await this.getFrameBitmap(frameIndex);
  }

  public async getFrameBitmap(frameIndex: number): Promise<ImageBitmap | null> {
    if (!this.metadata) return null;
    const idx = Math.max(0, Math.min(this.metadata.totalFrames - 1, Math.floor(frameIndex)));

    const cached = this.bitmapCache.get(idx);
    if (cached) {
      this.bitmapCache.delete(idx);
      this.bitmapCache.set(idx, cached);
      return cached;
    }

    if (typeof createImageBitmap !== 'function') {
      return null;
    }

    // 1. Hardware ImageDecoder fast-path
    if (this.useImageDecoder && this.imageDecoder) {
      try {
        const decoded = await this.imageDecoder.decode({ frameIndex: idx, completeFramesOnly: true });
        if (decoded?.image) {
          try {
            const bmp = await createImageBitmap(decoded.image);
            this.cacheBitmap(idx, bmp);
            return bmp;
          } finally {
            if (typeof decoded.image.close === 'function') {
              decoded.image.close();
            }
          }
        }
      } catch {
        // Fall back cleanly to pure-TS GIF89a compositor
      }
    }

    // 2. Pure-TS GIF89a compositor -> ImageBitmap
    const imgData = await this.getFrameImageData(idx);
    if (!imgData) return null;

    try {
      const bmp = await createImageBitmap(imgData);
      this.cacheBitmap(idx, bmp);
      return bmp;
    } catch {
      return null;
    }
  }

  public async getFrameImageData(frameIndex: number): Promise<ImageData | null> {
    if (!this.metadata || !this.parsed || this.parsed.frames.length === 0) return null;
    const idx = Math.max(0, Math.min(this.parsed.frames.length - 1, Math.floor(frameIndex)));

    const cached = this.imageDataCache.get(idx);
    if (cached) {
      this.imageDataCache.delete(idx);
      this.imageDataCache.set(idx, cached);
      return cached;
    }

    const { width, height, frames } = this.parsed;
    const pixelBytes = width * height * 4;

    if (!this.canvasBuffer || idx < this.lastCompositedIdx || this.lastCompositedIdx < 0) {
      this.canvasBuffer = new Uint8ClampedArray(pixelBytes);
      this.previousCanvasBuffer = new Uint8ClampedArray(pixelBytes);
      this.lastCompositedIdx = -1;
    }

    for (let f = this.lastCompositedIdx + 1; f <= idx; f++) {
      // Apply disposal method of previous frame before painting frame f
      if (f > 0) {
        const prevFrame = frames[f - 1];
        if (prevFrame.disposalMethod === 2) {
          // Restore previous frame's rect to transparent/background
          for (let py = 0; py < prevFrame.height; py++) {
            const cy = prevFrame.top + py;
            if (cy < 0 || cy >= height) continue;
            for (let px = 0; px < prevFrame.width; px++) {
              const cx = prevFrame.left + px;
              if (cx < 0 || cx >= width) continue;
              const off = (cy * width + cx) * 4;
              this.canvasBuffer[off] = 0;
              this.canvasBuffer[off + 1] = 0;
              this.canvasBuffer[off + 2] = 0;
              this.canvasBuffer[off + 3] = 0;
            }
          }
        } else if (prevFrame.disposalMethod === 3 && this.previousCanvasBuffer) {
          this.canvasBuffer.set(this.previousCanvasBuffer);
        }
      }

      const frame = frames[f];
      if (frame.disposalMethod === 3 && this.previousCanvasBuffer) {
        this.previousCanvasBuffer.set(this.canvasBuffer);
      }

      const expectedPixels = Math.max(0, frame.width * frame.height);
      const indices = decompressGifLzw(frame.minCodeSize, frame.lzwData, expectedPixels);

      // Interlace pass mapping (GIF89a standard: passes starting at 0,4,2,1 with steps 8,8,4,2)
      const mapRow = (rowIdx: number): number => {
        if (!frame.interlaced) return rowIdx;
        const passStarts = [0, 4, 2, 1];
        const passSteps = [8, 8, 4, 2];
        let count = 0;
        for (let p = 0; p < 4; p++) {
          const rowsInPass = Math.ceil((frame.height - passStarts[p]) / passSteps[p]);
          if (rowIdx < count + rowsInPass) {
            return passStarts[p] + (rowIdx - count) * passSteps[p];
          }
          count += Math.max(0, rowsInPass);
        }
        return rowIdx;
      };

      const ct = frame.colorTable;
      for (let py = 0; py < frame.height; py++) {
        const mappedY = mapRow(py);
        const cy = frame.top + mappedY;
        if (cy < 0 || cy >= height) continue;

        const srcRowStart = py * frame.width;
        for (let px = 0; px < frame.width; px++) {
          const cx = frame.left + px;
          if (cx < 0 || cx >= width) continue;

          const colorIdx = indices[srcRowStart + px];
          if (frame.hasTransparency && colorIdx === frame.transparentIndex) {
            continue;
          }
          const ctOff = colorIdx * 3;
          if (ctOff + 2 >= ct.length) continue;

          const dstOff = (cy * width + cx) * 4;
          this.canvasBuffer[dstOff] = ct[ctOff];
          this.canvasBuffer[dstOff + 1] = ct[ctOff + 1];
          this.canvasBuffer[dstOff + 2] = ct[ctOff + 2];
          this.canvasBuffer[dstOff + 3] = 255;
        }
      }

      this.lastCompositedIdx = f;
      if (f === idx || (f % 10 === 0 && !this.imageDataCache.has(f))) {
        this.cacheImageData(f, createImageDataSafe(this.canvasBuffer, width, height));
      }
    }

    const result = this.imageDataCache.get(idx) ?? createImageDataSafe(this.canvasBuffer, width, height);
    this.cacheImageData(idx, result);
    return result;
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
    if (this.imageDecoder && typeof this.imageDecoder.close === 'function') {
      try {
        this.imageDecoder.close();
      } catch {
        // ignore
      }
    }
    this.imageDecoder = null;
    this.canvasBuffer = null;
    this.previousCanvasBuffer = null;
    this.lastCompositedIdx = -1;
  }
}

/**
 * Helper utility that generates a valid minimal multi-frame or 1-frame GIF89a Blob in memory
 * for deterministic unit testing of `AnimatedGifLoader`.
 */
export function createSyntheticGifBlob(options: {
  width?: number;
  height?: number;
  delaysCs?: number[]; // centiseconds (1/100 s), e.g., [10, 0, 5]
  colors?: [number, number, number][]; // RGB palette entries (up to 4)
} = {}): Blob {
  const width = options.width ?? 16;
  const height = options.height ?? 16;
  const delaysCs = options.delaysCs ?? [10, 10, 10];
  const colors = options.colors ?? [
    [20, 24, 32],
    [240, 60, 60],
    [60, 220, 100],
    [60, 140, 250],
  ];

  // 4-color Global Color Table (2 bits -> minCodeSize = 2, clearCode = 4, eoiCode = 5)
  const out: number[] = [];
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  const pushU16 = (v: number) => {
    out.push(v & 0xff, (v >> 8) & 0xff);
  };

  pushStr('GIF89a');
  pushU16(width);
  pushU16(height);
  out.push(0x91); // GCT flag=1, color res=1, sort=0, GCT size=2^(1+1)=4 colors
  out.push(0x00); // background color index
  out.push(0x00); // pixel aspect ratio

  // 4-entry Global Color Table (12 bytes)
  for (let i = 0; i < 4; i++) {
    const c = colors[i % colors.length];
    out.push(c[0], c[1], c[2]);
  }

  // Encode each frame using uncompressed clear-code-reset 3-bit LZW stream
  for (let f = 0; f < delaysCs.length; f++) {
    const delay = Math.max(0, Math.round(delaysCs[f]));
    // Graphic Control Extension
    out.push(0x21, 0xf9, 0x04);
    out.push(0x04); // disposal=1 (do not dispose), no transparency
    pushU16(delay);
    out.push(0x00); // transparent index
    out.push(0x00); // block terminator

    // Image Descriptor
    out.push(0x2c);
    pushU16(0); // left
    pushU16(0); // top
    pushU16(width);
    pushU16(height);
    out.push(0x00); // no LCT, not interlaced

    // LZW minimum code size = 2 (clear=4, eoi=5, 3-bit codes before reset)
    out.push(0x02);

    // Emit 3-bit codes, resetting with clearCode=4 every 2 pixels so code width stays 3 bits
    const colorIdx = (f % 3) + 1; // 1, 2, 3 rotating per frame
    const bitCodes: number[] = [4]; // initial clear code
    const totalPixels = width * height;
    let sinceClear = 0;
    for (let p = 0; p < totalPixels; p++) {
      // Draw a bright moving 4x4 target block for ZNCC tracking tests
      const x = p % width;
      const y = Math.floor(p / width);
      const baseOriginX = width >= 32 ? 12 : 2;
      const targetX = Math.min(width - 4, baseOriginX + f * 2);
      const targetY = Math.floor(height / 2) - 2;
      const isTarget = x >= targetX && x < targetX + 4 && y >= targetY && y < targetY + 4;
      bitCodes.push(isTarget ? colorIdx : 0);
      sinceClear++;
      if (sinceClear >= 2) {
        bitCodes.push(4); // clear code keeps codeSize locked at 3 bits
        sinceClear = 0;
      }
    }
    bitCodes.push(5); // EOI code

    // Pack 3-bit codes LSB-first into bytes
    const lzwBytes: number[] = [];
    let acc = 0;
    let accBits = 0;
    for (const c of bitCodes) {
      acc |= (c & 0x07) << accBits;
      accBits += 3;
      while (accBits >= 8) {
        lzwBytes.push(acc & 0xff);
        acc >>= 8;
        accBits -= 8;
      }
    }
    if (accBits > 0) {
      lzwBytes.push(acc & 0xff);
    }

    // Write sub-blocks (max 255 bytes each)
    for (let off = 0; off < lzwBytes.length; off += 255) {
      const chunkLen = Math.min(255, lzwBytes.length - off);
      out.push(chunkLen);
      for (let k = 0; k < chunkLen; k++) {
        out.push(lzwBytes[off + k]);
      }
    }
    out.push(0x00); // sub-block terminator
  }

  out.push(0x3b); // GIF trailer
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}
