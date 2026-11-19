import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { ACCEPTED_VIDEO_ACCEPT_STRING } from '../src/utils/videoFormats';
import {
  AviHighSpeedLoader,
  COMPRESSED_NON_RAW_FOURCCS,
  createSyntheticAviBlob,
} from '../src/video/aviHighSpeedLoader';
import {
  inspectVideoMagicHeader,
  loadUniversalVideoFile,
  loadUnifiedMediaFiles,
  createSyntheticMovBlob,
  createSyntheticWmvBlob,
  createSyntheticFlvBlob,
  createSyntheticOggBlob,
} from '../src/video/universalVideoDecoder';
import {
  AnimatedGifLoader,
  buildMonotonicGifTimeline,
  createSyntheticGifBlob,
} from '../src/video/animatedGifLoader';
import {
  ImageSequenceLoader,
  filterAndSortZipImageEntries,
  createSyntheticBmpBlob,
  createMinimalPngHeaderBlob,
} from '../src/video/imageSequenceLoader';
import {
  naturalCompareFilenames,
  isValidSequenceImagePath,
} from '../src/video/unifiedFrameSource';
import { ingestWorkstationFile } from '../src/utils/projectPersistence';
import { autoTrackSequenceOnFrameSource } from '../src/math/autoTracker';

describe('Phase 1 Unified Multi-Format Media Engine & Honest Range-Safety Decoding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined' && 'electronVideoBridge' in window) {
      delete (window as any).electronVideoBridge;
    }
  });

  it('1. ACCEPTED_VIDEO_ACCEPT_STRING covers video, OGG, GIF, images, and ZIP/TRZ archives', () => {
    for (const token of [
      '.mp4',
      '.mov',
      '.ogg',
      '.ogv',
      '.webm',
      '.mkv',
      '.avi',
      '.wmv',
      '.flv',
      '.gif',
      '.png',
      '.jpg',
      '.jpeg',
      '.bmp',
      '.webp',
      '.zip',
      '.trz',
      'video/ogg',
      'image/gif',
      'image/png',
      'image/jpeg',
      'image/bmp',
      'image/webp',
    ]) {
      expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain(token);
    }
  });

  it('2. Compressed AVI (XVID / CVID / H264) NEVER decodes raw-BGR garbage or fake pixels and returns honest diagnostic card', async () => {
    expect(COMPRESSED_NON_RAW_FOURCCS.has('XVID')).toBe(true);
    expect(COMPRESSED_NON_RAW_FOURCCS.has('CVID')).toBe(true);
    expect(COMPRESSED_NON_RAW_FOURCCS.has('H264')).toBe(true);

    // Construct an AVI header labeled XVID with compressed payload
    const xvidBlob = createSyntheticAviBlob({
      width: 64,
      height: 48,
      fps: 250,
      frameCount: 4,
      fourCC: 'XVID',
    });
    const xvidFile = new File([xvidBlob], 'legacy_cinepak_xvid.avi', {
      type: 'video/x-msvideo',
    });

    // Direct AviHighSpeedLoader refuses to fabricate BGR pixels for compressed FourCC
    const directLoader = new AviHighSpeedLoader(xvidFile);
    await directLoader.initialize();
    const directFrame = await directLoader.getFrameImageData(0);
    expect(directFrame).toBeNull();
    directLoader.dispose();

    // Universal loader returns honest diagnostic notice instead of fake dot or garbage static
    const result = await loadUniversalVideoFile(xvidFile);
    expect(result.container).toBe('AVI');
    expect(result.codecFourCC).toBe('XVID');
    expect(result.requiresDesktopFfmpegBridge).toBe(true);
    expect(result.frameLoader).toBeNull();
    expect(result.videoUrl).toBe('');
    expect(result.diagnostic).toBeDefined();
    expect(result.diagnostic!.codecFourCC).toBe('XVID');
    expect(result.diagnostic!.ffmpegCommand).toContain('ffmpeg -i');
    expect(result.diagnostic!.ffmpegCommand).toContain('legacy_cinepak_xvid.avi');
  });

  it('3. OGG/OGV container magic bytes (OggS) are accurately detected', async () => {
    const oggBlob = createSyntheticOggBlob();
    const oggFile = new File([oggBlob], 'pendulum_theora.ogv', { type: 'video/ogg' });

    const magic = await inspectVideoMagicHeader(oggFile);
    expect(magic.container).toBe('OGG');
    expect(magic.signatureHex.startsWith('4F 67 67 53')).toBe(true);
    expect(magic.detectedFourCC).toBe('THEORA');
  });

  it('4. QuickTime .MOV parses 64-bit co64 + stsc tables and handles Y800, 24-bit raw RGB, and 32-bit ARGB pixel formats', async () => {
    const mov64Blob = createSyntheticMovBlob({
      width: 48,
      height: 36,
      fps: 120,
      frameCount: 4,
      useCo64: true,
      fourCC: 'Y800',
    });
    const mov64File = new File([mov64Blob], 'co64_highspeed.mov', { type: 'video/quicktime' });
    const loaded64 = await loadUniversalVideoFile(mov64File);
    expect(loaded64.container).toBe('MOV');
    expect(loaded64.frameLoader).not.toBeNull();
    expect(loaded64.totalFrames).toBe(4);
    const frame0 = await loaded64.frameLoader!.getFrameImageData(0);
    expect(frame0).not.toBeNull();
    expect(frame0!.width).toBe(48);
    expect(frame0!.height).toBe(36);
    loaded64.frameLoader!.dispose();

    const movArgbBlob = createSyntheticMovBlob({
      width: 32,
      height: 24,
      fps: 60,
      frameCount: 3,
      useCo64: true,
      fourCC: 'ARGB',
    });
    const movArgbFile = new File([movArgbBlob], 'argb_qt.mov', { type: 'video/quicktime' });
    const loadedArgb = await loadUniversalVideoFile(movArgbFile);
    expect(loadedArgb.frameLoader).not.toBeNull();
    const argbFrame = await loadedArgb.frameLoader!.getFrameImageData(1);
    expect(argbFrame).not.toBeNull();
    expect(argbFrame!.width).toBe(32);
    expect(argbFrame!.data[3]).toBe(255); // alpha preserved
    loadedArgb.frameLoader!.dispose();
  });

  it('5. Electron Desktop FFmpeg bridge succeeds for .WMV and .FLV when window.electronVideoBridge is present', async () => {
    const fakeMp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]).buffer;
    const mockBridge = {
      transcodeOrDecodeFile: vi.fn(async () => ({
        success: true,
        mp4Buffer: fakeMp4Bytes,
        fps: 60,
        width: 320,
        height: 240,
        totalFrames: 90,
      })),
    };
    (globalThis as any).window = (globalThis as any).window || {};
    (window as any).electronVideoBridge = mockBridge;

    const wmvBlob = createSyntheticWmvBlob({ width: 320, height: 240, durationSec: 1.5, fourCC: 'WMV3' });
    const wmvFile = new File([wmvBlob], 'range_test.wmv', { type: 'video/x-ms-wmv' });

    const loaded = await loadUniversalVideoFile(wmvFile);
    expect(mockBridge.transcodeOrDecodeFile).toHaveBeenCalledTimes(1);
    expect(loaded.tier).toBe(3);
    expect(loaded.usedCodecBridge).toBe(true);
    expect(loaded.requiresDesktopFfmpegBridge).toBeFalsy();
    expect(loaded.videoUrl.startsWith('blob:')).toBe(true);
    expect(loaded.totalFrames).toBe(90);

    const flvBlob = createSyntheticFlvBlob({ width: 320, height: 240, fps: 60, codecId: 7 });
    const flvFile = new File([flvBlob], 'archive_drop.flv', { type: 'video/x-flv' });
    const loadedFlv = await loadUniversalVideoFile(flvFile);
    expect(loadedFlv.tier).toBe(3);
    expect(loadedFlv.usedCodecBridge).toBe(true);
    expect(loadedFlv.videoUrl.startsWith('blob:')).toBe(true);
  });

  it('6. Animated GIF89a decodes exact frames, enforces strictly monotonic timestamps (0 ms clamped -> dt > 0), and handles static 1-frame GIF cleanly', async () => {
    // Test timeline monotonicity helper directly: mixed delays with 0 ms -> clamped to 100 ms
    const mixed = buildMonotonicGifTimeline([100, 0, 50]);
    expect(mixed.delaysMs).toEqual([100, 100, 50]);
    expect(Array.from(mixed.timestampsSec)).toEqual([0, 0.1, 0.2]);
    for (let i = 1; i < mixed.timestampsSec.length; i++) {
      expect(mixed.timestampsSec[i]).toBeGreaterThan(mixed.timestampsSec[i - 1]);
    }

    // All-zero delays fallback to 1000/30 ms per frame
    const allZero = buildMonotonicGifTimeline([0, 0, 0]);
    expect(allZero.effectiveFps).toBeCloseTo(30, 1);
    expect(allZero.timestampsSec[1]).toBeGreaterThan(allZero.timestampsSec[0]);
    expect(allZero.timestampsSec[2]).toBeGreaterThan(allZero.timestampsSec[1]);

    // Multi-frame GIF89a with a 0 cs delay on frame 1
    const multiGifBlob = createSyntheticGifBlob({
      width: 32,
      height: 24,
      delaysCs: [10, 0, 5, 10],
    });
    const multiGifFile = new File([multiGifBlob], 'oscillation.gif', { type: 'image/gif' });
    const loadedMulti = await loadUniversalVideoFile(multiGifFile);
    expect(loadedMulti.container).toBe('GIF');
    expect(loadedMulti.frameLoader).not.toBeNull();
    expect(loadedMulti.totalFrames).toBe(4);
    expect(loadedMulti.videoUrl).toBe('');

    const loader = loadedMulti.frameLoader!;
    for (let i = 1; i < loader.totalFrames; i++) {
      expect(loader.getFrameTimestampSec(i)).toBeGreaterThan(loader.getFrameTimestampSec(i - 1));
    }
    const f0 = await loader.getFrameImageData(0);
    const f2 = await loader.getFrameImageData(2);
    expect(f0).not.toBeNull();
    expect(f2).not.toBeNull();
    expect(f0!.width).toBe(32);
    expect(f0!.height).toBe(24);
    loader.dispose();

    // Static 1-frame GIF (0 delay) -> totalFrames = 1, finite fps & duration, zero NaN
    const staticGifBlob = createSyntheticGifBlob({
      width: 24,
      height: 20,
      delaysCs: [0],
    });
    const staticGifFile = new File([staticGifBlob], 'static_calibration.gif', { type: 'image/gif' });
    const staticLoader = new AnimatedGifLoader(staticGifFile);
    const staticMeta = await staticLoader.initialize();
    expect(staticMeta.totalFrames).toBe(1);
    expect(staticMeta.isSingleFrame).toBe(true);
    expect(Number.isFinite(staticMeta.fps)).toBe(true);
    expect(staticMeta.fps).toBeGreaterThan(0);
    expect(Number.isFinite(staticMeta.durationSec)).toBe(true);
    expect(staticMeta.durationSec).toBeGreaterThan(0);
    expect(staticLoader.getFrameTimestampSec(0)).toBe(0);
    staticLoader.dispose();
  });

  it('7. Multi-file numbered image sequence sorts naturally (frame_2 before frame_10), defaults to 30 fps, and calls bitmap.close() on LRU eviction & dispose()', async () => {
    expect(naturalCompareFilenames('frame_2.png', 'frame_10.png')).toBeLessThan(0);
    expect(naturalCompareFilenames('img001.jpg', 'img002.jpg')).toBeLessThan(0);

    const f10 = new File([createSyntheticBmpBlob({ width: 32, height: 32, targetX: 20, targetY: 16 })], 'frame_10.bmp', {
      type: 'image/bmp',
    });
    const f2 = new File([createSyntheticBmpBlob({ width: 32, height: 32, targetX: 10, targetY: 16 })], 'frame_2.bmp', {
      type: 'image/bmp',
    });
    const f1 = new File([createSyntheticBmpBlob({ width: 32, height: 32, targetX: 8, targetY: 16 })], 'frame_1.bmp', {
      type: 'image/bmp',
    });

    const loaded = await loadUnifiedMediaFiles([f10, f2, f1], undefined, 30);
    expect(loaded.container).toBe('IMAGE_SEQUENCE');
    expect(loaded.fps).toBe(30);
    expect(loaded.totalFrames).toBe(3);
    expect(loaded.frameLoader).not.toBeNull();
    const seq = loaded.frameLoader as ImageSequenceLoader;
    expect(seq.getFrameNames()).toEqual(['frame_1.bmp', 'frame_2.bmp', 'frame_10.bmp']);
    seq.dispose();

    // Verify LRU eviction and dispose() explicitly call bitmap.close()
    const closedBitmaps: number[] = [];
    let bitmapIdCounter = 0;
    const origCreateImageBitmap = (globalThis as any).createImageBitmap;
    (globalThis as any).createImageBitmap = vi.fn(async () => {
      const id = ++bitmapIdCounter;
      return {
        width: 32,
        height: 32,
        close: () => {
          closedBitmaps.push(id);
        },
      } as unknown as ImageBitmap;
    });

    try {
      const files = Array.from({ length: 6 }, (_, idx) =>
        new File([createSyntheticBmpBlob({ width: 32, height: 32, targetX: 6 + idx * 3, targetY: 16 })], `shot_${idx + 1}.bmp`, {
          type: 'image/bmp',
        })
      );
      // Small cache capacity of 4 (minimum clamp) -> reading 5 frames triggers eviction of frame 0
      const lruLoader = ImageSequenceLoader.fromFiles(files, 30, 4);
      await lruLoader.initialize(); // caches frame 0 as bitmap #1
      await lruLoader.getFrame(1);
      await lruLoader.getFrame(2);
      await lruLoader.getFrame(3);
      await lruLoader.getFrame(4); // evicts frame 0 -> closes bitmap #1
      expect(closedBitmaps.length).toBeGreaterThanOrEqual(1);
      expect(closedBitmaps).toContain(1);

      lruLoader.dispose(); // closes remaining 4 cached bitmaps (total 5)
      expect(closedBitmaps.length).toBe(5);
    } finally {
      (globalThis as any).createImageBitmap = origCreateImageBitmap;
    }
  });

  it('8. Zipped image sequence ignores __MACOSX/, dotfiles (._*), directories, and 0-byte entries, preserves natural sort, and stays lazy', async () => {
    expect(isValidSequenceImagePath('__MACOSX/frames/._frame_1.png')).toBe(false);
    expect(isValidSequenceImagePath('frames/.DS_Store')).toBe(false);
    expect(isValidSequenceImagePath('frames/._hidden.bmp')).toBe(false);
    expect(isValidSequenceImagePath('frames/frame_10.png')).toBe(true);

    const zip = new JSZip();
    zip.folder('__MACOSX');
    zip.file('__MACOSX/._frame_1.bmp', createSyntheticBmpBlob({ width: 32, height: 32 }));
    zip.file('.DS_Store', new Uint8Array([1, 2, 3, 4]));
    zip.file('frames/._frame_2.png', createMinimalPngHeaderBlob(32, 32));
    zip.file('frames/empty_0byte.png', new Uint8Array(0));
    zip.folder('frames/subdir');
    zip.file('frames/img_10.bmp', createSyntheticBmpBlob({ width: 32, height: 32, targetX: 20, targetY: 16 }));
    zip.file('frames/img_2.bmp', createSyntheticBmpBlob({ width: 32, height: 32, targetX: 12, targetY: 16 }));
    zip.file('frames/img_1.bmp', createSyntheticBmpBlob({ width: 32, height: 32, targetX: 8, targetY: 16 }));

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const parsedZip = await JSZip.loadAsync(zipBytes);
    const filtered = await filterAndSortZipImageEntries(parsedZip);

    expect(filtered.map((e) => e.name)).toEqual(['img_1.bmp', 'img_2.bmp', 'img_10.bmp']);

    // Verify ingestWorkstationFile routes the ZIP directly as a lazy image-sequence
    const zipFile = new File([zipBytes], 'highspeed_burst.zip', { type: 'application/zip' });
    const routed = await ingestWorkstationFile(zipFile);
    expect(routed.kind).toBe('image-sequence');
    expect(routed.route).toBe('zip-image-sequence');
    expect(routed.zipImageEntries?.length).toBe(3);

    const lazyLoader = ImageSequenceLoader.fromLazyZipEntries(routed.zipImageEntries!, zipFile.name, 30);
    const meta = await lazyLoader.initialize();
    expect(meta.totalFrames).toBe(3);
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
    const frame1 = await lazyLoader.getFrameImageData(1);
    expect(frame1).not.toBeNull();
    expect(frame1!.width).toBe(32);
    lazyLoader.dispose();
  });

  it('9. Single-frame clipboard image Blob loads with totalFrames === 1 and isSingleFrame === true', async () => {
    const clipBlob = createSyntheticBmpBlob({ width: 64, height: 48, targetX: 30, targetY: 24 });
    const pastedFile = new File([clipBlob], 'clipboard_frame_12345.bmp', { type: 'image/bmp' });

    const loaded = await loadUniversalVideoFile(pastedFile);
    expect(loaded.container).toBe('IMAGE');
    expect(loaded.totalFrames).toBe(1);
    expect(loaded.frameLoader).not.toBeNull();
    expect(loaded.frameLoader!.metadata?.isSingleFrame).toBe(true);
    expect(loaded.width).toBe(64);
    expect(loaded.height).toBe(48);

    const frame = await loaded.frameLoader!.getFrameImageData(0);
    expect(frame).not.toBeNull();
    expect(frame!.width).toBe(64);
    loaded.frameLoader!.dispose();
  });

  it('10. ZNCC sub-pixel auto-tracker runs directly on UnifiedFrameSource (ImageSequenceLoader & AnimatedGifLoader) without <video>', async () => {
    // Build a 5-frame BMP sequence where a bright target translates smoothly +2 px/frame along X
    const seqFiles = Array.from({ length: 5 }, (_, i) =>
      new File(
        [createSyntheticBmpBlob({ width: 64, height: 48, targetX: 14 + i * 2, targetY: 22 })],
        `track_${i + 1}.bmp`,
        { type: 'image/bmp' }
      )
    );
    const seqLoader = ImageSequenceLoader.fromFiles(seqFiles, 30);
    await seqLoader.initialize();

    const seqTracked = await autoTrackSequenceOnFrameSource(seqLoader, 0, 4, 1, 14, 22);
    expect(seqTracked.length).toBeGreaterThanOrEqual(4);
    expect(seqTracked[0].u).toBeCloseTo(14, 0);
    expect(seqTracked[1].u).toBeCloseTo(16, 0);
    expect(seqTracked[2].u).toBeCloseTo(18, 0);
    seqLoader.dispose();

    // Build a 4-frame synthetic GIF where a 4x4 bright block moves +2 px/frame along X starting at x=12
    const gifBlob = createSyntheticGifBlob({
      width: 64,
      height: 48,
      delaysCs: [5, 5, 5, 5],
      colors: [
        [20, 24, 32],
        [250, 250, 250],
        [250, 250, 250],
        [250, 250, 250],
      ],
    });
    const gifFile = new File([gifBlob], 'moving_target.gif', { type: 'image/gif' });
    const gifLoader = new AnimatedGifLoader(gifFile);
    await gifLoader.initialize();

    // Frame 0 target block is at x=[12..16), y=[22..26) -> center ~(14, 24)
    const gifTracked = await autoTrackSequenceOnFrameSource(gifLoader, 0, 3, 1, 14, 24);
    expect(gifTracked.length).toBeGreaterThanOrEqual(3);
    expect(gifTracked[1].u).toBeCloseTo(16, 0);
    gifLoader.dispose();
  });
});
