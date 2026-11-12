import { describe, it, expect } from 'vitest';
import { ACCEPTED_VIDEO_ACCEPT_STRING } from '../src/utils/videoFormats';
import { createSyntheticAviBlob } from '../src/video/aviHighSpeedLoader';
import {
  inspectVideoMagicHeader,
  loadUniversalVideoFile,
  createSyntheticMovBlob,
  createSyntheticWmvBlob,
  createSyntheticFlvBlob,
} from '../src/video/universalVideoDecoder';
import { autoTrackSequenceOnAviLoader } from '../src/math/autoTracker';

describe('Universal Multi-Format & Codec Video Engine (.MP4, .AVI, .WMV, .FLV, .MOV)', () => {
  it('1. explicitly lists .mp4, .avi, .wmv, .flv, and .mov extensions and MIME types in ACCEPTED_VIDEO_ACCEPT_STRING', () => {
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('.mp4');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('.avi');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('.wmv');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('.flv');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('.mov');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('video/mp4');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('video/x-msvideo');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('video/x-ms-wmv');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('video/x-flv');
    expect(ACCEPTED_VIDEO_ACCEPT_STRING).toContain('video/quicktime');
  });

  it('2. Tier 1 (.AVI): inspects RIFF/AVI magic bytes, decodes frames zero-copy, and runs ZNCC autoTracker', async () => {
    const aviBlob = createSyntheticAviBlob({
      width: 64,
      height: 48,
      fps: 500,
      frameCount: 8,
      fourCC: 'Y800',
    });
    const aviFile = new File([aviBlob], 'highspeed_test.avi', { type: 'video/x-msvideo' });

    const magic = await inspectVideoMagicHeader(aviFile);
    expect(magic.container).toBe('AVI');
    expect(magic.detectedFourCC).toBe('Y800');
    expect(magic.width).toBe(64);
    expect(magic.height).toBe(48);
    expect(magic.fps).toBe(500);
    expect(magic.totalFrames).toBe(8);

    const loaded = await loadUniversalVideoFile(aviFile);
    expect(loaded.tier).toBe(1);
    expect(loaded.frameLoader).not.toBeNull();

    const tracked = await autoTrackSequenceOnAviLoader(loaded.frameLoader!, 0, 5, 1, 10, 15);
    expect(tracked.length).toBeGreaterThanOrEqual(4);
    expect(tracked[1].u).toBeCloseTo(13, 0);
  });

  it('3. Tier 1 (.MOV): parses QuickTime ftypqt / moov / stbl sample tables, decodes frames via File.slice(), and tracks target', async () => {
    const movBlob = createSyntheticMovBlob({
      width: 64,
      height: 48,
      fps: 240,
      frameCount: 6,
    });
    const movFile = new File([movBlob], 'ballistics_quicktime.mov', { type: 'video/quicktime' });

    const magic = await inspectVideoMagicHeader(movFile);
    expect(magic.container).toBe('MOV');
    expect(magic.width).toBe(64);
    expect(magic.height).toBe(48);
    expect(magic.totalFrames).toBe(6);

    const loaded = await loadUniversalVideoFile(movFile);
    expect(loaded.container).toBe('MOV');
    expect(loaded.frameLoader).not.toBeNull();

    const frame0 = await loaded.frameLoader!.getFrameImageData(0);
    expect(frame0).not.toBeNull();
    expect(frame0!.width).toBe(64);
    expect(frame0!.height).toBe(48);

    const tracked = await autoTrackSequenceOnAviLoader(loaded.frameLoader!, 0, 4, 1, 10, 14);
    expect(tracked.length).toBeGreaterThanOrEqual(4);
    expect(tracked[1].u).toBeCloseTo(13, 0);
  });

  it('4. Tier 3 (.WMV): detects ASF Header GUID (30 26 B2 75 8E 66 CF 11), parses WMV3 dimensions/duration, and provides frame-accurate loader', async () => {
    const wmvBlob = createSyntheticWmvBlob({
      width: 320,
      height: 240,
      durationSec: 1.5,
      fourCC: 'WMV3',
    });
    const wmvFile = new File([wmvBlob], 'osp_pendulum.wmv', { type: 'video/x-ms-wmv' });

    const magic = await inspectVideoMagicHeader(wmvFile);
    expect(magic.container).toBe('WMV');
    expect(magic.signatureHex.startsWith('30 26 B2 75 8E 66 CF 11')).toBe(true);
    expect(magic.detectedFourCC).toBe('WMV3');
    expect(magic.width).toBe(320);
    expect(magic.height).toBe(240);

    const loaded = await loadUniversalVideoFile(wmvFile);
    expect(loaded.container).toBe('WMV');
    expect(loaded.frameLoader).not.toBeNull();
    const frameData = await loaded.frameLoader!.getFrameImageData(0);
    expect(frameData).not.toBeNull();
    expect(frameData!.width).toBe(320);
    expect(frameData!.height).toBe(240);
  });

  it('5. Tier 1/3 (.FLV): detects FLV signature (46 4C 56 01), parses Tag 0x09 CodecID & AMF metadata, and provides frame-accurate loader', async () => {
    const flvBlob = createSyntheticFlvBlob({
      width: 320,
      height: 240,
      fps: 60,
      codecId: 7,
    });
    const flvFile = new File([flvBlob], 'projectile_archive.flv', { type: 'video/x-flv' });

    const magic = await inspectVideoMagicHeader(flvFile);
    expect(magic.container).toBe('FLV');
    expect(magic.signatureHex.startsWith('46 4C 56 01')).toBe(true);
    expect(magic.detectedFourCC).toContain('AVC1');
    expect(magic.width).toBe(320);
    expect(magic.height).toBe(240);
    expect(magic.fps).toBe(60);

    const loaded = await loadUniversalVideoFile(flvFile);
    expect(loaded.container).toBe('FLV');
    expect(loaded.frameLoader).not.toBeNull();
    const frameData = await loaded.frameLoader!.getFrameImageData(0);
    expect(frameData).not.toBeNull();
    expect(frameData!.width).toBe(320);
  });
});
