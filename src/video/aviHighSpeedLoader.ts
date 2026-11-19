/**
 * Defense & High-Speed Camera Zero-Copy RIFF / OpenDML .AVI Ingestion Engine
 * (Supports 750 MB – 4 GB+ Phantom / Photron / Fastec / NAC High-Speed .AVI Recordings)
 *
 * Architecture:
 * 1. NEVER calls file.arrayBuffer() on the entire file.
 * 2. Uses File.slice(offset, offset + length) to read only the first 256 KB RIFF/AVI header
 *    (avih, strh, strf BITMAPINFOHEADER) and the OpenDML indx/ix00 super-index or tail idx1 chunk.
 * 3. Stores the frame index in compact TypedArrays (Float64Array offsets + Uint32Array byte sizes),
 *    consuming < 300 KB of RAM for 20,000 high-speed frames.
 * 4. Decodes individual frames on-demand via File.slice(offset[k], offset[k] + size[k]) directly
 *    into ImageData / ImageBitmap for:
 *    - MJPG / JPEG (Motion-JPEG via createImageBitmap)
 *    - Y800 / GREY / Y8 (8-bit monochrome raw sensor data)
 *    - DIB / RGB / BI_RGB (8-bit indexed/grayscale, 16-bit RGB555, 24-bit BGR, 32-bit BGRA)
 *    - UYVY / YUY2 (16-bit 4:2:2 YUV)
 * 5. Maintains a bounded LRU cache (default 120 frames) that calls bitmap.close() on eviction.
 */

import {
  FrameSourceKind,
  UnifiedFrameMetadata,
  UnifiedFrameSource,
} from './unifiedFrameSource';

export type AviStreamMetadata = UnifiedFrameMetadata;

/**
 * Compressed inter-frame / proprietary codecs that MUST NEVER be decoded as raw uncompressed BGR.
 */
export const COMPRESSED_NON_RAW_FOURCCS = new Set([
  'CVID',
  'MSVC',
  'CRAM',
  'XVID',
  'DIVX',
  'DX50',
  'IV32',
  'IV41',
  'IV50',
  'H264',
  'AVC1',
  'X264',
  'MP4V',
  'M4S2',
  'FMP4',
  'MP42',
  'MP43',
  'WMV1',
  'WMV2',
  'WMV3',
  'WVC1',
  'WMVA',
  'VP6F',
  'FLV1',
  'SVQ1',
  'SVQ3',
  'APCH',
  'APCN',
  'APCS',
  'APCO',
  'AP4H',
  'HEV1',
  'HVC1',
  'VP80',
  'VP90',
  'AV01',
]);

export interface AviFrameIndexTable {
  count: number;
  offsets: Float64Array; // Exact 53-bit integer byte offset of frame payload in File
  sizes: Uint32Array; // Byte length of frame payload
  flags: Uint8Array; // 1 = keyframe
}

const HEADER_SLICE_BYTES = 256 * 1024; // 256 KB initial slice for RIFF hdrl
const TAIL_INDEX_SLICE_BYTES = 4 * 1024 * 1024; // 4 MB slice for idx1 table

function readFourCC(view: DataView, offset: number): string {
  if (offset + 4 > view.byteLength) return '';
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function readUint64LE(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 4294967296 + low;
}

function isVideoChunkFourCC(fcc: string): boolean {
  return (
    fcc === '00dc' ||
    fcc === '00db' ||
    fcc === '01dc' ||
    fcc === '01db' ||
    fcc === '00iv'
  );
}

export class AviHighSpeedLoader implements UnifiedFrameSource {
  public readonly sourceKind: FrameSourceKind = 'avi';
  private file: File | Blob;
  private fileName: string;
  public metadata: AviStreamMetadata | null = null;
  public frameIndex: AviFrameIndexTable | null = null;

  // Bounded LRU cache for decoded frames
  private maxCacheFrames: number;
  private bitmapCache = new Map<number, ImageBitmap>();
  private imageDataCache = new Map<number, ImageData>();

  constructor(file: File | Blob, fileName = 'highspeed_capture.avi', maxCacheFrames = 120) {
    this.file = file;
    this.fileName = file instanceof File ? file.name : fileName;
    this.maxCacheFrames = maxCacheFrames;
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
    return this.metadata?.fps ?? 30;
  }

  public get durationSec(): number {
    return this.metadata?.durationSec ?? 0;
  }

  public getFrameTimestampSec(frameIndex: number): number {
    const safeFps = this.fps > 0 ? this.fps : 30;
    const idx = Math.max(0, Math.min(Math.max(0, this.totalFrames - 1), Math.floor(frameIndex)));
    return idx / safeFps;
  }

  public async getFrame(frameIndex: number): Promise<ImageBitmap | null> {
    return await this.getFrameBitmap(frameIndex);
  }

  /**
   * Reads a small byte range from the underlying File/Blob without loading the rest of the file.
   */
  private async readSliceBuffer(offset: number, length: number): Promise<ArrayBuffer> {
    const safeStart = Math.max(0, Math.min(this.file.size, offset));
    const safeEnd = Math.max(safeStart, Math.min(this.file.size, safeStart + length));
    const blobSlice = this.file.slice(safeStart, safeEnd);
    if (typeof blobSlice.arrayBuffer === 'function') {
      return await blobSlice.arrayBuffer();
    }
    // Fallback for environments where Blob.arrayBuffer is polyfilled via FileReader
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Failed to read AVI slice'));
      reader.readAsArrayBuffer(blobSlice);
    });
  }

  /**
   * Initializes the demuxer by parsing the RIFF/AVI headers and constructing the lightweight
   * in-memory frame offset lookup table.
   */
  public async initialize(): Promise<AviStreamMetadata> {
    const fileSize = this.file.size;
    if (fileSize < 64) {
      throw new Error('File is too small to be a valid RIFF .AVI container.');
    }

    const headBuf = await this.readSliceBuffer(0, Math.min(fileSize, HEADER_SLICE_BYTES));
    const headView = new DataView(headBuf);

    const riffSig = readFourCC(headView, 0);
    const aviSig = readFourCC(headView, 8);
    if (riffSig !== 'RIFF' || (aviSig !== 'AVI ' && aviSig !== 'AVIX')) {
      throw new Error(
        `Invalid AVI container signature: expected "RIFF....AVI ", found "${riffSig}....${aviSig}".`
      );
    }

    let width = 640;
    let height = 480;
    let isTopDown = false;
    let bitCount = 24;
    let compressionCode = 0;
    let compressionFourCC = 'DIB ';
    let fps = 500;
    let avihTotalFrames = 0;
    let strhHandler = '';
    let palette: Uint8Array | undefined;

    let moviListOffset = -1;
    let moviListSize = 0;
    let indxChunkOffset = -1;
    let indxChunkSize = 0;

    // Walk top-level and nested chunks inside the initial header slice
    const parseHeaderRange = (startOffset: number, endOffset: number) => {
      let pos = startOffset;
      const limit = Math.min(endOffset, headView.byteLength - 8);

      while (pos <= limit) {
        const fcc = readFourCC(headView, pos);
        const cbSize = headView.getUint32(pos + 4, true);
        const dataPos = pos + 8;

        if (fcc === 'LIST') {
          const listType = readFourCC(headView, dataPos);
          if (listType === 'movi') {
            moviListOffset = pos;
            moviListSize = cbSize;
          } else if (
            listType === 'hdrl' ||
            listType === 'strl' ||
            listType === 'odml'
          ) {
            parseHeaderRange(dataPos + 4, Math.min(headView.byteLength, dataPos + cbSize));
          }
        } else if (fcc === 'avih' && dataPos + 40 <= headView.byteLength) {
          const microSecPerFrame = headView.getUint32(dataPos, true);
          if (microSecPerFrame > 0) {
            fps = Math.round((1_000_000 / microSecPerFrame) * 1000) / 1000;
          }
          avihTotalFrames = headView.getUint32(dataPos + 16, true);
          const w = headView.getInt32(dataPos + 32, true);
          const h = headView.getInt32(dataPos + 36, true);
          if (w > 0) width = w;
          if (Math.abs(h) > 0) height = Math.abs(h);
        } else if (fcc === 'strh' && dataPos + 48 <= headView.byteLength) {
          const streamType = readFourCC(headView, dataPos);
          if (streamType === 'vids') {
            strhHandler = readFourCC(headView, dataPos + 4);
            const scale = headView.getUint32(dataPos + 20, true);
            const rate = headView.getUint32(dataPos + 24, true);
            const length = headView.getUint32(dataPos + 32, true);
            if (scale > 0 && rate > 0) {
              fps = Math.round((rate / scale) * 1000) / 1000;
            }
            if (length > avihTotalFrames) {
              avihTotalFrames = length;
            }
          }
        } else if (fcc === 'strf' && dataPos + 40 <= headView.byteLength) {
          // BITMAPINFOHEADER
          const biSize = headView.getUint32(dataPos, true);
          const biWidth = headView.getInt32(dataPos + 4, true);
          const biHeight = headView.getInt32(dataPos + 8, true);
          const biBitCount = headView.getUint16(dataPos + 14, true);
          const biCompression = headView.getUint32(dataPos + 16, true);

          if (biWidth > 0) width = biWidth;
          if (biHeight !== 0) {
            height = Math.abs(biHeight);
            isTopDown = biHeight < 0;
          }
          if (biBitCount > 0) bitCount = biBitCount;
          compressionCode = biCompression;

          if (biCompression === 0) {
            compressionFourCC =
              strhHandler && strhHandler.trim().length > 0 && strhHandler !== '\0\0\0\0'
                ? strhHandler
                : bitCount === 8
                ? 'Y800'
                : 'DIB ';
          } else {
            compressionFourCC = readFourCC(headView, dataPos + 16);
          }

          // For 8-bit Y800/GREY, top-down is standard even when biHeight > 0
          if (
            compressionFourCC === 'Y800' ||
            compressionFourCC === 'GREY' ||
            compressionFourCC === 'Y8  '
          ) {
            isTopDown = true;
          }

          // Extract 256-entry BGRA palette if present for 8-bit indexed DIB
          if (bitCount === 8 && cbSize >= biSize + 256 * 4 && dataPos + biSize + 1024 <= headView.byteLength) {
            palette = new Uint8Array(headBuf.slice(dataPos + biSize, dataPos + biSize + 1024));
          }
        } else if (fcc === 'dmlh' && dataPos + 4 <= headView.byteLength) {
          const odmlTotalFrames = headView.getUint32(dataPos, true);
          if (odmlTotalFrames > avihTotalFrames) {
            avihTotalFrames = odmlTotalFrames;
          }
        } else if (fcc === 'indx' && indxChunkOffset === -1) {
          indxChunkOffset = pos;
          indxChunkSize = cbSize;
        }

        const paddedSize = cbSize + (cbSize & 1);
        if (paddedSize === 0 && fcc === '') break;
        pos = dataPos + paddedSize;
      }
    };

    parseHeaderRange(12, headView.byteLength);

    // Build Frame Index Table using OpenDML indx, Legacy idx1, or Zero-Copy movi Header Hopping
    let indexTable: AviFrameIndexTable | null = null;
    let indexType: AviStreamMetadata['indexType'] = 'legacy_idx1';

    if (indxChunkOffset !== -1 && indxChunkSize >= 24) {
      indexTable = await this.parseOpenDmlIndex(indxChunkOffset, indxChunkSize);
      if (indexTable && indexTable.count > 0) {
        indexType = 'opendml_indx';
      }
    }

    if (!indexTable || indexTable.count === 0) {
      indexTable = await this.parseLegacyIdx1(moviListOffset, moviListSize);
      if (indexTable && indexTable.count > 0) {
        indexType = 'legacy_idx1';
      }
    }

    if (!indexTable || indexTable.count === 0) {
      indexTable = await this.scanMoviChunkHeaders(moviListOffset > 0 ? moviListOffset : 12);
      indexType = 'movi_header_scan';
    }

    this.frameIndex = indexTable;
    const totalFrames = Math.max(indexTable.count, 1);
    const indexMemoryBytes =
      indexTable.offsets.byteLength +
      indexTable.sizes.byteLength +
      indexTable.flags.byteLength;

    this.metadata = {
      fileName: this.fileName,
      fileSizeBytes: fileSize,
      width,
      height,
      isTopDown,
      bitCount,
      compressionFourCC,
      compressionCode,
      fps: fps > 0 ? fps : 500,
      totalFrames,
      durationSec: totalFrames / (fps > 0 ? fps : 500),
      isOpenDML: indexType === 'opendml_indx' || fileSize > 2_000_000_000,
      indexType,
      indexMemoryBytes,
      palette,
    };

    return this.metadata;
  }

  /**
   * Parses OpenDML 'indx' Super-Index (AVI_INDEX_OF_INDEXES) or Standard Chunk Index (AVI_INDEX_OF_CHUNKS).
   */
  private async parseOpenDmlIndex(
    indxOffset: number,
    indxSize: number
  ): Promise<AviFrameIndexTable | null> {
    const buf = await this.readSliceBuffer(indxOffset + 8, Math.min(indxSize, 262144));
    const view = new DataView(buf);
    if (view.byteLength < 24) return null;

    const wLongsPerEntry = view.getUint16(0, true);
    const bIndexSubType = view.getUint8(2);
    const bIndexType = view.getUint8(3);
    const nEntriesInUse = view.getUint32(4, true);

    const offsetsList: number[] = [];
    const sizesList: number[] = [];
    const flagsList: number[] = [];

    // AVI_INDEX_OF_CHUNKS (0x01)
    if (bIndexType === 1 && wLongsPerEntry === 2 && bIndexSubType === 0) {
      const baseOffset = readUint64LE(view, 12);
      let entryPos = 24;
      for (let i = 0; i < nEntriesInUse && entryPos + 8 <= view.byteLength; i++) {
        const relOffset = view.getUint32(entryPos, true);
        const sizeAndFlag = view.getUint32(entryPos + 4, true);
        const size = sizeAndFlag & 0x7fffffff;
        const isDelta = (sizeAndFlag & 0x80000000) !== 0;
        if (size > 0) {
          offsetsList.push(baseOffset + relOffset);
          sizesList.push(size);
          flagsList.push(isDelta ? 0 : 1);
        }
        entryPos += 8;
      }
    }
    // AVI_INDEX_OF_INDEXES (0x00) -> points to ix00 sub-index chunks
    else if (bIndexType === 0 && wLongsPerEntry === 4) {
      let entryPos = 24;
      for (let i = 0; i < nEntriesInUse && entryPos + 16 <= view.byteLength; i++) {
        const subChunkOffset = readUint64LE(view, entryPos);
        const subChunkSize = view.getUint32(entryPos + 8, true);
        entryPos += 16;

        if (subChunkOffset > 0 && subChunkSize >= 32 && subChunkOffset < this.file.size) {
          const ixBuf = await this.readSliceBuffer(
            subChunkOffset + 8,
            Math.min(subChunkSize, 2 * 1024 * 1024)
          );
          const ixView = new DataView(ixBuf);
          if (ixView.byteLength >= 24) {
            const subEntries = ixView.getUint32(4, true);
            const baseOff = readUint64LE(ixView, 12);
            let subPos = 24;
            for (let k = 0; k < subEntries && subPos + 8 <= ixView.byteLength; k++) {
              const relOff = ixView.getUint32(subPos, true);
              const szFlag = ixView.getUint32(subPos + 4, true);
              const sz = szFlag & 0x7fffffff;
              if (sz > 0) {
                offsetsList.push(baseOff + relOff);
                sizesList.push(sz);
                flagsList.push((szFlag & 0x80000000) === 0 ? 1 : 0);
              }
              subPos += 8;
            }
          }
        }
      }
    }

    if (offsetsList.length === 0) return null;
    return {
      count: offsetsList.length,
      offsets: new Float64Array(offsetsList),
      sizes: new Uint32Array(sizesList),
      flags: new Uint8Array(flagsList),
    };
  }

  /**
   * Parses the classic AVI 'idx1' chunk at the end of the RIFF movi section using a tail slice.
   */
  private async parseLegacyIdx1(
    moviListOffset: number,
    moviListSize: number
  ): Promise<AviFrameIndexTable | null> {
    const fileSize = this.file.size;
    let searchStart = Math.max(0, fileSize - TAIL_INDEX_SLICE_BYTES);
    if (moviListOffset > 0 && moviListSize > 0) {
      const expectedIdx1Pos = moviListOffset + 8 + moviListSize;
      if (expectedIdx1Pos < fileSize) {
        searchStart = Math.max(0, expectedIdx1Pos - 64);
      }
    }

    const tailBuf = await this.readSliceBuffer(
      searchStart,
      Math.min(TAIL_INDEX_SLICE_BYTES, fileSize - searchStart)
    );
    const view = new DataView(tailBuf);

    // Locate 'idx1' signature
    let idx1RelPos = -1;
    for (let i = 0; i <= view.byteLength - 8; i++) {
      if (
        view.getUint8(i) === 0x69 && // 'i'
        view.getUint8(i + 1) === 0x64 && // 'd'
        view.getUint8(i + 2) === 0x78 && // 'x'
        view.getUint8(i + 3) === 0x31 // '1'
      ) {
        idx1RelPos = i;
        break;
      }
    }

    if (idx1RelPos === -1) return null;

    const idx1Size = view.getUint32(idx1RelPos + 4, true);
    const entriesStart = idx1RelPos + 8;
    const entriesEnd = Math.min(view.byteLength, entriesStart + idx1Size);

    // Determine whether idx1 offsets are relative to movi data start (moviListOffset + 8) or absolute file start (0)
    const moviDataStart = moviListOffset > 0 ? moviListOffset + 8 : 0;
    let offsetBase = moviDataStart;

    if (entriesStart + 16 <= entriesEnd) {
      const firstChunkOffset = view.getUint32(entriesStart + 8, true);
      // Test if absolute or relative to moviListOffset + 8
      if (moviListOffset > 0 && firstChunkOffset >= moviDataStart) {
        const probeAbs = await this.readSliceBuffer(firstChunkOffset, 8);
        const probeAbsFcc = readFourCC(new DataView(probeAbs), 0);
        if (isVideoChunkFourCC(probeAbsFcc)) {
          offsetBase = 0;
        }
      }
    }

    const offsetsList: number[] = [];
    const sizesList: number[] = [];
    const flagsList: number[] = [];

    for (let pos = entriesStart; pos + 16 <= entriesEnd; pos += 16) {
      const ckid = readFourCC(view, pos);
      if (!isVideoChunkFourCC(ckid)) continue;

      const dwFlags = view.getUint32(pos + 4, true);
      const dwChunkOffset = view.getUint32(pos + 8, true);
      const dwChunkLength = view.getUint32(pos + 12, true);

      if (dwChunkLength > 0) {
        // Payload starts 8 bytes after chunk header ('00dc' + size)
        const payloadOffset = offsetBase + dwChunkOffset + 8;
        offsetsList.push(payloadOffset);
        sizesList.push(dwChunkLength);
        flagsList.push((dwFlags & 0x10) !== 0 ? 1 : 0);
      }
    }

    if (offsetsList.length === 0) return null;

    return {
      count: offsetsList.length,
      offsets: new Float64Array(offsetsList),
      sizes: new Uint32Array(sizesList),
      flags: new Uint8Array(flagsList),
    };
  }

  /**
   * Fallback zero-copy chunk header scanner when idx1 is missing or truncated.
   * Hops from chunk header to chunk header (reading only 12 bytes per hop) without loading frame payloads.
   */
  private async scanMoviChunkHeaders(startHint: number): Promise<AviFrameIndexTable> {
    const fileSize = this.file.size;
    let pos = startHint;

    const offsetsList: number[] = [];
    const sizesList: number[] = [];
    const flagsList: number[] = [];

    const maxHops = 50000;
    let hops = 0;

    while (pos + 8 <= fileSize && hops < maxHops) {
      hops++;
      const hdrBuf = await this.readSliceBuffer(pos, 12);
      if (hdrBuf.byteLength < 8) break;
      const v = new DataView(hdrBuf);
      const fcc = readFourCC(v, 0);
      const cbSize = v.getUint32(4, true);

      if (fcc === 'LIST' || fcc === 'RIFF') {
        // Step inside LIST ('movi', 'rec ', etc.)
        pos += 12;
        continue;
      }

      if (isVideoChunkFourCC(fcc) && cbSize > 0 && pos + 8 + cbSize <= fileSize) {
        offsetsList.push(pos + 8);
        sizesList.push(cbSize);
        flagsList.push(1);
      }

      if (cbSize === 0 && !/^[A-Za-z0-9_ ]{4}$/.test(fcc)) {
        break;
      }

      const padded = cbSize + (cbSize & 1);
      pos += 8 + Math.max(0, padded);
    }

    return {
      count: offsetsList.length,
      offsets: new Float64Array(offsetsList),
      sizes: new Uint32Array(sizesList),
      flags: new Uint8Array(flagsList),
    };
  }

  /**
   * Decodes a single frame k on-demand into an ImageData object using only File.slice(offset[k], offset[k] + size[k]).
   */
  public async getFrameImageData(frameNumber: number): Promise<ImageData | null> {
    if (!this.metadata || !this.frameIndex || this.frameIndex.count === 0) {
      return null;
    }

    const idx = Math.max(0, Math.min(this.frameIndex.count - 1, Math.floor(frameNumber)));
    const cached = this.imageDataCache.get(idx);
    if (cached) {
      // Refresh LRU order
      this.imageDataCache.delete(idx);
      this.imageDataCache.set(idx, cached);
      return cached;
    }

    const offset = this.frameIndex.offsets[idx];
    const size = this.frameIndex.sizes[idx];
    if (size === 0 || offset + size > this.file.size) return null;

    const { width, height, bitCount, compressionFourCC, compressionCode, isTopDown, palette } = this.metadata;

    // 1. MJPG / JPEG / PNG compressed frame
    const upperFcc = compressionFourCC.toUpperCase();
    const trimmedFcc = upperFcc.trim();

    // STRICT RANGE-SAFETY GUARD: Never decode compressed inter-frame bitstreams as raw uncompressed BGR.
    if (COMPRESSED_NON_RAW_FOURCCS.has(trimmedFcc)) {
      return null;
    }

    if (upperFcc === 'MJPG' || upperFcc === 'JPEG' || upperFcc === 'MPNG' || upperFcc === 'PNG ') {
      const bitmap = await this.getFrameBitmap(idx);
      if (!bitmap) return null;
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, width, height);
          const imgData = ctx.getImageData(0, 0, width, height);
          this.cacheImageData(idx, imgData);
          return imgData;
        }
      }
      return null;
    }

    // 2. Uncompressed / Raw High-Speed Sensor & QuickTime Raw Formats (Y800, Y16, GREY, DIB, RGB, RGBA, ARGB, BGRA, UYVY, 2VUY, YUY2, NV12)
    const frameBuf = await this.readSliceBuffer(offset, size);
    const src = new Uint8Array(frameBuf);
    const rgba = new Uint8ClampedArray(width * height * 4);

    if (upperFcc === 'Y16 ' || upperFcc === 'Y16' || (bitCount === 16 && (upperFcc === 'Y800' || upperFcc === 'GREY' || upperFcc === 'DIB '))) {
      // 16-bit Monochrome High-Speed Sensor (Phantom / Photron / Fastec 12/14/16-bit packed in 16-bit LE words)
      const totalPixels = width * height;
      const view16 = new DataView(frameBuf);
      let minVal = 65535;
      let maxVal = 0;
      const maxSamples = Math.min(totalPixels, Math.floor(frameBuf.byteLength / 2));
      for (let i = 0; i < maxSamples; i++) {
        const v16 = view16.getUint16(i * 2, true);
        if (v16 < minVal) minVal = v16;
        if (v16 > maxVal) maxVal = v16;
      }
      const range = maxVal > minVal ? maxVal - minVal : 255;
      const useAutoRange = maxVal <= 4095 || (maxVal - minVal > 0 && maxVal < 16384);

      for (let y = 0; y < height; y++) {
        const srcRow = isTopDown ? y : height - 1 - y;
        const srcRowStart = srcRow * width;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          const sampleIdx = srcRowStart + x;
          const raw16 = sampleIdx * 2 + 2 <= frameBuf.byteLength ? view16.getUint16(sampleIdx * 2, true) : 0;
          const lum = useAutoRange
            ? Math.max(0, Math.min(255, Math.round(((raw16 - minVal) * 255) / range)))
            : raw16 >> 8;
          const dIdx = dstRowStart + x * 4;
          rgba[dIdx] = lum;
          rgba[dIdx + 1] = lum;
          rgba[dIdx + 2] = lum;
          rgba[dIdx + 3] = 255;
        }
      }
    } else if (
      upperFcc === 'Y800' ||
      upperFcc === 'GREY' ||
      upperFcc === 'Y8  ' ||
      upperFcc === 'Y8' ||
      bitCount === 8
    ) {
      // 8-bit Monochrome or Paletted DIB
      const rowStride = bitCount === 8 && upperFcc === 'DIB ' ? (width + 3) & ~3 : width;
      for (let y = 0; y < height; y++) {
        const srcRow = isTopDown ? y : height - 1 - y;
        const srcRowStart = srcRow * rowStride;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          const lum = src[srcRowStart + x] ?? 0;
          const dIdx = dstRowStart + x * 4;
          if (palette && palette.length >= 1024) {
            const pIdx = lum * 4;
            rgba[dIdx] = palette[pIdx + 2];
            rgba[dIdx + 1] = palette[pIdx + 1];
            rgba[dIdx + 2] = palette[pIdx];
            rgba[dIdx + 3] = 255;
          } else {
            rgba[dIdx] = lum;
            rgba[dIdx + 1] = lum;
            rgba[dIdx + 2] = lum;
            rgba[dIdx + 3] = 255;
          }
        }
      }
    } else if (upperFcc === 'NV12' || upperFcc === 'I420' || upperFcc === 'YV12') {
      // 12-bit 4:2:0 YUV planar / semi-planar
      const yPlaneSize = width * height;
      const isNV12 = upperFcc === 'NV12';
      const isYV12 = upperFcc === 'YV12';
      const uvQuarterSize = (width >> 1) * (height >> 1);
      for (let y = 0; y < height; y++) {
        const dstRowStart = y * width * 4;
        const uvRow = y >> 1;
        for (let x = 0; x < width; x++) {
          const yVal = src[y * width + x] ?? 16;
          const uvCol = x >> 1;
          let u = 0;
          let v = 0;
          if (isNV12) {
            const uvIdx = yPlaneSize + uvRow * width + uvCol * 2;
            u = (src[uvIdx] ?? 128) - 128;
            v = (src[uvIdx + 1] ?? 128) - 128;
          } else {
            const uPlaneStart = isYV12 ? yPlaneSize + uvQuarterSize : yPlaneSize;
            const vPlaneStart = isYV12 ? yPlaneSize : yPlaneSize + uvQuarterSize;
            const subIdx = uvRow * (width >> 1) + uvCol;
            u = (src[uPlaneStart + subIdx] ?? 128) - 128;
            v = (src[vPlaneStart + subIdx] ?? 128) - 128;
          }
          const dIdx = dstRowStart + x * 4;
          rgba[dIdx] = Math.max(0, Math.min(255, yVal + 1.402 * v));
          rgba[dIdx + 1] = Math.max(0, Math.min(255, yVal - 0.344136 * u - 0.714136 * v));
          rgba[dIdx + 2] = Math.max(0, Math.min(255, yVal + 1.772 * u));
          rgba[dIdx + 3] = 255;
        }
      }
    } else if (upperFcc === 'UYVY' || upperFcc === '2VUY' || upperFcc === 'YUY2' || upperFcc === 'YUYV') {
      // 16-bit 4:2:2 YUV (UYVY / QuickTime 2vuy / YUY2)
      const isUYVY = upperFcc === 'UYVY' || upperFcc === '2VUY';
      const rowStride = width * 2;
      if (src.byteLength < height * rowStride) return null;
      for (let y = 0; y < height; y++) {
        const srcRowStart = y * rowStride;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x += 2) {
          const sIdx = srcRowStart + x * 2;
          const y0 = isUYVY ? src[sIdx + 1] : src[sIdx];
          const u = (isUYVY ? src[sIdx] : src[sIdx + 1]) - 128;
          const y1 = isUYVY ? src[sIdx + 3] : src[sIdx + 2];
          const v = (isUYVY ? src[sIdx + 2] : src[sIdx + 3]) - 128;

          const r0 = Math.max(0, Math.min(255, y0 + 1.402 * v));
          const g0 = Math.max(0, Math.min(255, y0 - 0.344136 * u - 0.714136 * v));
          const b0 = Math.max(0, Math.min(255, y0 + 1.772 * u));

          const r1 = Math.max(0, Math.min(255, y1 + 1.402 * v));
          const g1 = Math.max(0, Math.min(255, y1 - 0.344136 * u - 0.714136 * v));
          const b1 = Math.max(0, Math.min(255, y1 + 1.772 * u));

          const d0 = dstRowStart + x * 4;
          rgba[d0] = r0;
          rgba[d0 + 1] = g0;
          rgba[d0 + 2] = b0;
          rgba[d0 + 3] = 255;

          if (x + 1 < width) {
            const d1 = d0 + 4;
            rgba[d1] = r1;
            rgba[d1 + 1] = g1;
            rgba[d1 + 2] = b1;
            rgba[d1 + 3] = 255;
          }
        }
      }
    } else if (bitCount === 16 && (upperFcc === 'DIB ' || upperFcc === 'RGB ' || compressionCode === 0)) {
      // 16-bit RGB555 uncompressed DIB
      const rowStride = (width * 2 + 3) & ~3;
      const view16 = new DataView(frameBuf);
      for (let y = 0; y < height; y++) {
        const srcRow = isTopDown ? y : height - 1 - y;
        const srcRowStart = srcRow * rowStride;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          const bytePos = srcRowStart + x * 2;
          const pix16 = bytePos + 2 <= frameBuf.byteLength ? view16.getUint16(bytePos, true) : 0;
          const r = ((pix16 >> 10) & 0x1f) * 8;
          const g = ((pix16 >> 5) & 0x1f) * 8;
          const b = (pix16 & 0x1f) * 8;
          const dIdx = dstRowStart + x * 4;
          rgba[dIdx] = r;
          rgba[dIdx + 1] = g;
          rgba[dIdx + 2] = b;
          rgba[dIdx + 3] = 255;
        }
      }
    } else if (bitCount === 32 || upperFcc === 'ARGB' || upperFcc === 'RGBA' || upperFcc === 'BGRA') {
      // 32-bit Uncompressed (QuickTime ARGB/RGBA or Windows BGRA)
      const rowStride = width * 4;
      if (src.byteLength < height * rowStride) return null;
      const isARGB = upperFcc === 'ARGB';
      const isRGBA = upperFcc === 'RGBA';
      for (let y = 0; y < height; y++) {
        const srcRow = isTopDown ? y : height - 1 - y;
        const srcRowStart = srcRow * rowStride;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          const sIdx = srcRowStart + x * 4;
          const dIdx = dstRowStart + x * 4;
          if (isARGB) {
            rgba[dIdx] = src[sIdx + 1] ?? 0;
            rgba[dIdx + 1] = src[sIdx + 2] ?? 0;
            rgba[dIdx + 2] = src[sIdx + 3] ?? 0;
            rgba[dIdx + 3] = 255;
          } else if (isRGBA) {
            rgba[dIdx] = src[sIdx] ?? 0;
            rgba[dIdx + 1] = src[sIdx + 1] ?? 0;
            rgba[dIdx + 2] = src[sIdx + 2] ?? 0;
            rgba[dIdx + 3] = 255;
          } else {
            rgba[dIdx] = src[sIdx + 2] ?? 0;
            rgba[dIdx + 1] = src[sIdx + 1] ?? 0;
            rgba[dIdx + 2] = src[sIdx] ?? 0;
            rgba[dIdx + 3] = 255;
          }
        }
      }
    } else if (upperFcc === 'RGB ' || upperFcc === 'RGB' || upperFcc === 'DIB ' || upperFcc === 'DIB' || upperFcc === 'BGR ' || compressionCode === 0) {
      // 24-bit Uncompressed RGB (QuickTime packed) or BGR (Windows DIB 4-byte aligned)
      const isRgbOrder = upperFcc === 'RGB ' || upperFcc === 'RGB';
      const rowStride = isRgbOrder ? width * 3 : (width * 3 + 3) & ~3;
      if (src.byteLength < height * width * 3) {
        // Never wrap compressed/truncated bitstreams modulo buffer length (eliminates static garbage)
        return null;
      }
      for (let y = 0; y < height; y++) {
        const srcRow = isTopDown ? y : height - 1 - y;
        const srcRowStart = srcRow * rowStride;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          const sIdx = srcRowStart + x * 3;
          const dIdx = dstRowStart + x * 4;
          if (isRgbOrder) {
            rgba[dIdx] = src[sIdx] ?? 0;
            rgba[dIdx + 1] = src[sIdx + 1] ?? 0;
            rgba[dIdx + 2] = src[sIdx + 2] ?? 0;
          } else {
            rgba[dIdx] = src[sIdx + 2] ?? 0; // R
            rgba[dIdx + 1] = src[sIdx + 1] ?? 0; // G
            rgba[dIdx + 2] = src[sIdx] ?? 0; // B
          }
          rgba[dIdx + 3] = 255;
        }
      }
    } else {
      // Unknown / unsupported codec: refuse to fabricate raw pixels
      return null;
    }

    const imgData =
      typeof ImageData !== 'undefined'
        ? new ImageData(rgba, width, height)
        : ({ data: rgba, width, height, colorSpace: 'srgb' } as ImageData);

    this.cacheImageData(idx, imgData);
    return imgData;
  }

  /**
   * Decodes a single frame k on-demand into an ImageBitmap for hardware-accelerated Canvas 2D drawing.
   */
  public async getFrameBitmap(frameNumber: number): Promise<ImageBitmap | null> {
    if (!this.metadata || !this.frameIndex || this.frameIndex.count === 0) {
      return null;
    }

    const idx = Math.max(0, Math.min(this.frameIndex.count - 1, Math.floor(frameNumber)));
    const cached = this.bitmapCache.get(idx);
    if (cached) {
      this.bitmapCache.delete(idx);
      this.bitmapCache.set(idx, cached);
      return cached;
    }

    const offset = this.frameIndex.offsets[idx];
    const size = this.frameIndex.sizes[idx];
    if (size === 0 || offset + size > this.file.size) return null;

    const { compressionFourCC } = this.metadata;

    if (typeof createImageBitmap === 'function') {
      if (compressionFourCC === 'MJPG' || compressionFourCC === 'JPEG') {
        const jpegBlob = this.file.slice(offset, offset + size, 'image/jpeg');
        try {
          const bmp = await createImageBitmap(jpegBlob);
          this.cacheBitmap(idx, bmp);
          return bmp;
        } catch {
          return null;
        }
      }

      const imgData = await this.getFrameImageData(idx);
      if (imgData) {
        try {
          const bmp = await createImageBitmap(imgData);
          this.cacheBitmap(idx, bmp);
          return bmp;
        } catch {
          return null;
        }
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

  /**
   * Releases all cached ImageBitmaps and clears memory.
   */
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
 * Helper utility that builds a valid binary RIFF .AVI Blob in-memory for testing
 * the zero-copy File.slice() demuxer and Y800 / DIB frame decoders.
 */
export function createSyntheticAviBlob(options: {
  width?: number;
  height?: number;
  fps?: number;
  frameCount?: number;
  fourCC?: 'Y800' | 'DIB ';
} = {}): Blob {
  const width = options.width ?? 64;
  const height = options.height ?? 48;
  const fps = options.fps ?? 500;
  const frameCount = options.frameCount ?? 10;
  const fourCC = options.fourCC ?? 'Y800';
  const bitCount = fourCC === 'Y800' ? 8 : 24;
  const bytesPerPixel = bitCount / 8;
  const frameByteSize = width * height * bytesPerPixel;

  // Compute exact chunk sizes:
  // RIFF (12)
  //   LIST hdrl (12 + avih[64] + LIST strl[12 + strh(64) + strf(48)] = 200) -> 208 bytes total
  //   LIST movi (12 + frameCount * (8 + frameByteSize))
  //   idx1 (8 + frameCount * 16)
  const hdrlContentSize = 4 + 64 + (12 + 64 + 48); // 192
  const moviContentSize = 4 + frameCount * (8 + frameByteSize);
  const idx1ContentSize = frameCount * 16;
  const totalFileSize = 12 + (8 + hdrlContentSize) + (8 + moviContentSize) + (8 + idx1ContentSize);

  const buf = new ArrayBuffer(totalFileSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < 4; i++) {
      view.setUint8(off + i, str.charCodeAt(i) || 0x20);
    }
  };

  let pos = 0;
  writeStr(pos, 'RIFF');
  view.setUint32(pos + 4, totalFileSize - 8, true);
  writeStr(pos + 8, 'AVI ');
  pos += 12;

  // LIST hdrl
  writeStr(pos, 'LIST');
  view.setUint32(pos + 4, hdrlContentSize, true);
  writeStr(pos + 8, 'hdrl');
  pos += 12;

  // avih (56 bytes payload)
  writeStr(pos, 'avih');
  view.setUint32(pos + 4, 56, true);
  view.setUint32(pos + 8, Math.round(1_000_000 / fps), true); // microSecPerFrame
  view.setUint32(pos + 8 + 16, frameCount, true); // totalFrames
  view.setUint32(pos + 8 + 24, 1, true); // streams
  view.setInt32(pos + 8 + 32, width, true);
  view.setInt32(pos + 8 + 36, height, true);
  pos += 64;

  // LIST strl
  writeStr(pos, 'LIST');
  view.setUint32(pos + 4, 4 + 64 + 48, true);
  writeStr(pos + 8, 'strl');
  pos += 12;

  // strh (56 bytes payload)
  writeStr(pos, 'strh');
  view.setUint32(pos + 4, 56, true);
  writeStr(pos + 8, 'vids');
  writeStr(pos + 12, fourCC);
  view.setUint32(pos + 8 + 20, 1, true); // scale
  view.setUint32(pos + 8 + 24, fps, true); // rate
  view.setUint32(pos + 8 + 32, frameCount, true); // length
  pos += 64;

  // strf BITMAPINFOHEADER (40 bytes payload)
  writeStr(pos, 'strf');
  view.setUint32(pos + 4, 40, true);
  view.setUint32(pos + 8, 40, true); // biSize
  view.setInt32(pos + 12, width, true); // biWidth
  view.setInt32(pos + 16, fourCC === 'Y800' ? -height : height, true); // biHeight
  view.setUint16(pos + 20, 1, true); // biPlanes
  view.setUint16(pos + 22, bitCount, true); // biBitCount
  if (fourCC === 'Y800') {
    writeStr(pos + 24, 'Y800');
  } else {
    view.setUint32(pos + 24, 0, true); // BI_RGB
  }
  view.setUint32(pos + 28, frameByteSize, true);
  pos += 48;

  // LIST movi
  const moviListOffset = pos;
  writeStr(pos, 'LIST');
  view.setUint32(pos + 4, moviContentSize, true);
  writeStr(pos + 8, 'movi');
  pos += 12;

  const chunkRelOffsets: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    // Offset relative to 'movi' tag (moviListOffset + 8)
    chunkRelOffsets.push(pos - (moviListOffset + 8));
    writeStr(pos, '00db');
    view.setUint32(pos + 4, frameByteSize, true);
    pos += 8;

    // Synthesize a bright moving target marker at (10 + f*3, 20 + f)
    const targetX = Math.min(width - 2, 10 + f * 3);
    const targetY = Math.min(height - 2, 15 + f);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isMarker = Math.abs(x - targetX) <= 1 && Math.abs(y - targetY) <= 1;
        const val = isMarker ? 250 : (20 + f) & 0xff;
        if (fourCC === 'Y800') {
          bytes[pos + y * width + x] = val;
        } else {
          const pOff = pos + (height - 1 - y) * width * 3 + x * 3;
          bytes[pOff] = val;
          bytes[pOff + 1] = val;
          bytes[pOff + 2] = val;
        }
      }
    }
    pos += frameByteSize;
  }

  // idx1 chunk
  writeStr(pos, 'idx1');
  view.setUint32(pos + 4, idx1ContentSize, true);
  pos += 8;
  for (let f = 0; f < frameCount; f++) {
    writeStr(pos, '00db');
    view.setUint32(pos + 4, 0x10, true); // AVIIF_KEYFRAME
    view.setUint32(pos + 8, chunkRelOffsets[f], true);
    view.setUint32(pos + 12, frameByteSize, true);
    pos += 16;
  }

  return new Blob([buf], { type: 'video/x-msvideo' });
}
