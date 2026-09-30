import JSZip from 'jszip';

export interface AcceptedFormatInfo {
  name: string;
  category: 'Modern Web / Native' | 'QuickTime / Apple' | 'Laboratory & Camera' | 'Container & Legacy' | 'Animated Image' | 'Tracker Package';
  extensions: string[];
  mimeTypes: string[];
  codecs: string;
  nativeBrowserSupport: 'Full Native' | 'Supported (Chromium/Electron)' | 'Container Dependent' | 'Special Handling';
  typicalUsage: string;
  notes: string;
}

export const ACCEPTED_VIDEO_FORMATS: AcceptedFormatInfo[] = [
  {
    name: 'MP4 (MPEG-4 Part 14)',
    category: 'Modern Web / Native',
    extensions: ['.mp4', '.m4v', '.m4p'],
    mimeTypes: ['video/mp4', 'video/x-m4v'],
    codecs: 'H.264 (AVC), H.265 (HEVC), AV1, MPEG-4 Visual',
    nativeBrowserSupport: 'Full Native',
    typicalUsage: 'Standard video cameras, smartphones (Android/iOS), web captures, screen recordings.',
    notes: 'Universally recommended for physics tracking with sub-frame seek accuracy and GPU acceleration.',
  },
  {
    name: 'QuickTime Movie (MOV)',
    category: 'QuickTime / Apple',
    extensions: ['.mov', '.qt'],
    mimeTypes: ['video/quicktime'],
    codecs: 'H.264, Apple ProRes, MPEG-4, Motion JPEG',
    nativeBrowserSupport: 'Supported (Chromium/Electron)',
    typicalUsage: 'Apple iPhone high-speed 120/240 fps slow-motion, iPad labs, DSLR & mirrorless cameras.',
    notes: 'Native hardware playback in Chrome, Safari, Edge, and Electron. Standard for high-speed iOS physics experiments.',
  },
  {
    name: 'WebM Video',
    category: 'Modern Web / Native',
    extensions: ['.webm'],
    mimeTypes: ['video/webm'],
    codecs: 'VP8, VP9, AV1, Opus/Vorbis',
    nativeBrowserSupport: 'Full Native',
    typicalUsage: 'HTML5 laboratory recordings, open web physics simulations, screen recordings.',
    notes: 'Open royalty-free format with high frame-rate seeking and low latency.',
  },
  {
    name: 'Matroska Video (MKV)',
    category: 'Modern Web / Native',
    extensions: ['.mkv'],
    mimeTypes: ['video/x-matroska', 'video/mkv'],
    codecs: 'H.264, H.265, VP9, AV1, MPEG-2',
    nativeBrowserSupport: 'Supported (Chromium/Electron)',
    typicalUsage: 'High-definition lab recordings, multi-track audio/video experiments, OBS Studio recordings.',
    notes: 'Natively decoded in modern Chromium and Electron desktop runtime.',
  },
  {
    name: 'Audio Video Interleave (AVI)',
    category: 'Laboratory & Camera',
    extensions: ['.avi'],
    mimeTypes: ['video/x-msvideo', 'video/avi'],
    codecs: 'Motion JPEG (MJPEG), uncompressed raw, DivX, Xvid, Intel Indeo',
    nativeBrowserSupport: 'Container Dependent',
    typicalUsage: 'Scientific high-speed cameras, legacy Tracker OSP video clips, industrial vision cameras.',
    notes: 'MJPEG and standard codecs play natively. Legacy proprietary 1990s codecs (e.g. Indeo 4.1) will suggest quick 1-click H.264 transcode.',
  },
  {
    name: 'AVCHD & Transport Streams (MTS, M2TS, TS)',
    category: 'Laboratory & Camera',
    extensions: ['.mts', '.m2ts', '.ts'],
    mimeTypes: ['video/mp2t', 'video/ts'],
    codecs: 'H.264/MPEG-4 AVC, MPEG-2',
    nativeBrowserSupport: 'Supported (Chromium/Electron)',
    typicalUsage: 'Sony, Panasonic, and Canon HD camcorders; laboratory optical sensors.',
    notes: 'High-bitrate progressive streams used in university motion analysis laboratories.',
  },
  {
    name: 'MPEG-1 & MPEG-2 Video',
    category: 'Container & Legacy',
    extensions: ['.mpg', '.mpeg', '.m1v', '.m2v', '.vob'],
    mimeTypes: ['video/mpeg'],
    codecs: 'MPEG-1, MPEG-2 Part 2',
    nativeBrowserSupport: 'Container Dependent',
    typicalUsage: 'Legacy educational DVDs, physics demonstration discs, optical capture cards.',
    notes: 'Standard MPEG streams are parsed seamlessly.',
  },
  {
    name: 'Windows Media Video (WMV / ASF)',
    category: 'Container & Legacy',
    extensions: ['.wmv', '.asf'],
    mimeTypes: ['video/x-ms-wmv', 'video/x-ms-asf'],
    codecs: 'WMV7, WMV8, WMV9, VC-1',
    nativeBrowserSupport: 'Container Dependent',
    typicalUsage: 'Windows PC screen captures, Microsoft PowerPoint video exports, older lab equipment.',
    notes: 'Supported in Windows Electron runtime. For web browsers, H.264 MP4 is recommended.',
  },
  {
    name: 'Flash Video (FLV / F4V)',
    category: 'Container & Legacy',
    extensions: ['.flv', '.f4v'],
    mimeTypes: ['video/x-flv', 'video/mp4'],
    codecs: 'Sorenson Spark, VP6, H.264',
    nativeBrowserSupport: 'Container Dependent',
    typicalUsage: 'Legacy educational web archives and physics simulations.',
    notes: 'H.264-encoded F4V/FLV files play natively; older VP6 files offer quick guidance.',
  },
  {
    name: '3GPP Mobile Video',
    category: 'Container & Legacy',
    extensions: ['.3gp', '.3g2'],
    mimeTypes: ['video/3gpp', 'video/3gpp2'],
    codecs: 'H.263, H.264, MPEG-4',
    nativeBrowserSupport: 'Supported (Chromium/Electron)',
    typicalUsage: 'Compact mobile recordings, older mobile phone cameras.',
    notes: 'H.264-based 3GP streams play natively.',
  },
  {
    name: 'Ogg Theora Video',
    category: 'Container & Legacy',
    extensions: ['.ogv', '.ogg'],
    mimeTypes: ['video/ogg'],
    codecs: 'Theora, Vorbis',
    nativeBrowserSupport: 'Supported (Chromium/Electron)',
    typicalUsage: 'Linux physics laboratories, Wikipedia motion clips.',
    notes: 'Natively decoded in Chrome, Firefox, and Electron.',
  },
  {
    name: 'Animated GIF & WebP Image Sequence',
    category: 'Animated Image',
    extensions: ['.gif', '.webp'],
    mimeTypes: ['image/gif', 'image/webp'],
    codecs: 'LZW, Lossless WebP',
    nativeBrowserSupport: 'Special Handling',
    typicalUsage: 'Thermal camera exports, oscilloscope capture loops, slow-motion GIF demonstrations.',
    notes: 'Automatically detected and rendered with full step-by-step point tracking and coordinate marking.',
  },
  {
    name: 'Tracker Experiment Packages (TRZ / TRK / ZIP)',
    category: 'Tracker Package',
    extensions: ['.trz', '.trk', '.zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    codecs: 'Embedded MP4 / MOV / AVI / WebM',
    nativeBrowserSupport: 'Full Native',
    typicalUsage: 'Classic Open Source Physics (OSP) Tracker experiment archives (e.g. BallToss.trz, car.trz).',
    notes: 'Automatically unzips and extracts the bundled laboratory video and loads it straight into the workstation.',
  },
];

// Flat list of all accepted file extensions
export const ALL_ACCEPTED_EXTENSIONS: string[] = Array.from(
  new Set(ACCEPTED_VIDEO_FORMATS.flatMap((f) => f.extensions))
);

// HTML file input accept attribute string
export const ACCEPTED_VIDEO_ACCEPT_STRING: string = [
  'video/*',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
  ...ALL_ACCEPTED_EXTENSIONS,
].join(',');

export interface VideoInspectionResult {
  fileName: string;
  extension: string;
  sizeBytes: number;
  sizeFormatted: string;
  mimeType: string;
  formatInfo?: AcceptedFormatInfo;
  isArchive: boolean;
  isImageSequence: boolean;
  isProbablySupported: boolean;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function inspectVideoFile(file: File): VideoInspectionResult {
  const fileName = file.name;
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  const extension = extMatch ? `.${extMatch[1].toLowerCase()}` : '';
  const mimeType = file.type || '';

  const formatInfo = ACCEPTED_VIDEO_FORMATS.find(
    (f) =>
      f.extensions.includes(extension) ||
      (mimeType && f.mimeTypes.some((m) => mimeType.toLowerCase().startsWith(m.toLowerCase())))
  );

  const isArchive = ['.trz', '.trk', '.zip'].includes(extension);
  const isImageSequence = ['.gif', '.webp'].includes(extension) || mimeType.startsWith('image/');

  // Test standard HTML5 video support
  let isProbablySupported = true;
  if (!isArchive && !isImageSequence) {
    if (mimeType) {
      const probe = document.createElement('video');
      const canPlay = probe.canPlayType(mimeType);
      if (canPlay === '') {
        // If MIME is unknown or not supported natively, check extension
        if (['.avi', '.wmv', '.flv', '.vob'].includes(extension)) {
          isProbablySupported = false;
        }
      }
    }
  }

  return {
    fileName,
    extension,
    sizeBytes: file.size,
    sizeFormatted: formatFileSize(file.size),
    mimeType: mimeType || 'unknown/binary',
    formatInfo,
    isArchive,
    isImageSequence,
    isProbablySupported,
  };
}

/**
 * Extracts the primary video from a Tracker .trz or .zip archive.
 */
export interface VideoMetadataProbeResult {
  fileName: string;
  extension: string;
  sizeBytes: number;
  sizeFormatted: string;
  mimeType: string;
  container: string;
  detectedCodec: string;
  isNativelyPlayable: boolean;
  isOptimalForKinematics: boolean;
  warningLevel: 'none' | 'warning' | 'error';
  warningTitle: string;
  warningMessage: string;
  suggestedProfile: string;
  suggestedFfmpegCmd: string;
  videoWidth?: number;
  videoHeight?: number;
  duration?: number;
}

export async function probeVideoMetadata(file: File): Promise<VideoMetadataProbeResult> {
  const fileName = file.name;
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  const extension = extMatch ? `.${extMatch[1].toLowerCase()}` : '';
  const mimeType = file.type || '';
  const sizeBytes = file.size;
  const sizeFormatted = formatFileSize(sizeBytes);
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  let container = 'Unknown Container';
  let detectedCodec = 'Standard Web Codec';
  let warningLevel: 'none' | 'warning' | 'error' = 'none';
  let warningTitle = '';
  let warningMessage = '';
  let isNativelyPlayable = true;
  let isOptimalForKinematics = true;

  const isArchive = ['.trz', '.trk', '.zip'].includes(extension);
  const isImageSequence = ['.gif', '.webp'].includes(extension) || mimeType.startsWith('image/');

  if (isArchive) {
    container = 'Tracker Package (TRZ/ZIP)';
    detectedCodec = 'Embedded Laboratory Package';
    return {
      fileName,
      extension,
      sizeBytes,
      sizeFormatted,
      mimeType: mimeType || 'application/zip',
      container,
      detectedCodec,
      isNativelyPlayable: true,
      isOptimalForKinematics: true,
      warningLevel: 'none',
      warningTitle: '',
      warningMessage: '',
      suggestedProfile: 'H.264 / AAC MP4',
      suggestedFfmpegCmd: '',
    };
  }

  if (isImageSequence) {
    container = extension === '.gif' ? 'Animated GIF' : 'Animated WebP';
    detectedCodec = 'Frame Sequence (Raster)';
    return {
      fileName,
      extension,
      sizeBytes,
      sizeFormatted,
      mimeType: mimeType || 'image/gif',
      container,
      detectedCodec,
      isNativelyPlayable: true,
      isOptimalForKinematics: true,
      warningLevel: 'none',
      warningTitle: '',
      warningMessage: '',
      suggestedProfile: 'H.264 / AAC MP4 (for smoother sub-frame scrubbing)',
      suggestedFfmpegCmd: `ffmpeg -i "${fileName}" -c:v libx264 -crf 18 -pix_fmt yuv420p -vsync cfr -r 30 -movflags +faststart "${baseName}_converted.mp4"`,
    };
  }

  // 1. Binary header inspection (first 8KB) to identify container and FourCC codec
  let headerText = '';
  try {
    const slice = file.slice(0, 8192);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      const code = bytes[i];
      if (code >= 32 && code <= 126) {
        str += String.fromCharCode(code);
      } else {
        str += ' ';
      }
    }
    headerText = str;

    // Detect AVI container & FourCC
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && headerText.includes('AVI ')) {
      container = 'Audio Video Interleave (AVI)';
      if (headerText.includes('IV32') || headerText.includes('IV41') || headerText.includes('IV50')) {
        detectedCodec = 'Intel Indeo (IV32/IV41/IV50)';
        warningLevel = 'error';
        warningTitle = 'Legacy Indeo Codec Profile Detected';
        warningMessage = 'This AVI file is compressed with Intel Indeo (1990s legacy codec). Modern browsers and host operating systems lack GPU decoders for Indeo.';
        isNativelyPlayable = false;
        isOptimalForKinematics = false;
      } else if (headerText.includes('cvid')) {
        detectedCodec = 'Cinepak (cvid)';
        warningLevel = 'error';
        warningTitle = 'Legacy Cinepak Codec Profile Detected';
        warningMessage = 'This file uses obsolete Cinepak compression. Modern browsers and host operating systems cannot decode Cinepak natively.';
        isNativelyPlayable = false;
        isOptimalForKinematics = false;
      } else if (headerText.includes('DIVX') || headerText.includes('XVID') || headerText.includes('DX50')) {
        detectedCodec = 'DivX / Xvid MPEG-4';
        warningLevel = 'warning';
        warningTitle = 'MPEG-4 DivX/Xvid Profile Detected';
        warningMessage = 'DivX/Xvid streams in AVI containers often fail HTML5 hardware playback depending on your host OS.';
        isOptimalForKinematics = false;
      } else if (headerText.includes('MJPG') || headerText.includes('mjpg')) {
        detectedCodec = 'Motion JPEG (MJPEG)';
        warningLevel = 'warning';
        warningTitle = 'Motion-JPEG AVI Profile';
        warningMessage = 'MJPEG AVI files have high intra-frame data rates and may stutter or drop frames during kinematic scrubbing.';
        isOptimalForKinematics = false;
      } else if (headerText.includes('DIB ') || headerText.includes('RAW ') || headerText.includes('HFYU') || headerText.includes('LAGS')) {
        detectedCodec = 'Uncompressed Raw / Lossless AVI';
        warningLevel = 'warning';
        warningTitle = 'Uncompressed High-Bitrate AVI Detected';
        warningMessage = 'Uncompressed scientific camera video may exceed browser memory bandwidth. Converting to H.264 MP4 will provide smooth 60fps tracking.';
        isOptimalForKinematics = false;
      } else {
        detectedCodec = 'Standard AVI Stream';
        if (['.avi'].includes(extension)) {
          warningLevel = 'warning';
          warningTitle = 'AVI Container Compatibility Notice';
          warningMessage = 'AVI containers rely on host OS DirectShow filters. Hardware acceleration is not guaranteed in standard web browsers.';
          isOptimalForKinematics = false;
        }
      }
    }
    // Detect QuickTime MOV / MP4
    else if (headerText.includes('ftyp') || headerText.includes('moov')) {
      container = extension === '.mov' ? 'QuickTime Movie (MOV)' : 'MPEG-4 Part 14 (MP4)';
      if (headerText.includes('apch') || headerText.includes('apcn') || headerText.includes('apcs') || headerText.includes('apco') || headerText.includes('ap4h')) {
        detectedCodec = 'Apple ProRes (422/4444)';
        warningLevel = 'warning';
        warningTitle = 'Apple ProRes Profile Detected';
        warningMessage = 'Apple ProRes studio footage requires high decoding bandwidth and may fail hardware acceleration on non-Apple operating systems.';
        isOptimalForKinematics = false;
      } else if (headerText.includes('SVQ1') || headerText.includes('SVQ3')) {
        detectedCodec = 'Sorenson Video (SVQ1/SVQ3)';
        warningLevel = 'error';
        warningTitle = 'Legacy Sorenson Codec Profile Detected';
        warningMessage = 'Sorenson Video is an obsolete QuickTime codec unsupported by modern browser hardware pipelines.';
        isNativelyPlayable = false;
        isOptimalForKinematics = false;
      } else if (headerText.includes('hvc1') || headerText.includes('hev1')) {
        detectedCodec = 'HEVC / H.265';
        const testCanPlay = document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
        if (!testCanPlay) {
          warningLevel = 'warning';
          warningTitle = 'HEVC (H.265) Codec Profile Detected';
          warningMessage = 'HEVC requires host OS hardware decoder licenses (e.g. Windows HEVC Video Extension). Converting to H.264 guarantees universal playback.';
          isOptimalForKinematics = false;
        }
      } else if (headerText.includes('avc1')) {
        detectedCodec = 'H.264 (AVC)';
      }
    }
    // Detect Windows Media
    else if (extension === '.wmv' || extension === '.asf' || (bytes[0] === 0x30 && bytes[1] === 0x26 && bytes[2] === 0xB2 && bytes[3] === 0x75)) {
      container = 'Windows Media Video (WMV)';
      detectedCodec = 'WMV9 / VC-1';
      warningLevel = 'warning';
      warningTitle = 'Windows Media (WMV) Profile Detected';
      warningMessage = 'WMV files cannot be decoded in non-Windows browsers or standard Web standards. Convert to MP4 for universal compatibility.';
      isOptimalForKinematics = false;
    }
    // Detect Transport Stream
    else if (extension === '.mts' || extension === '.m2ts' || extension === '.ts' || bytes[0] === 0x47) {
      container = 'AVCHD / Transport Stream (MTS/TS)';
      detectedCodec = 'MPEG-2 / AVCHD Interlaced';
      warningLevel = 'warning';
      warningTitle = 'Camcorder Transport Stream Detected';
      warningMessage = 'AVCHD camcorder streams frequently contain interlaced video (comb artifacts) and may fail in standard HTML5 players.';
      isOptimalForKinematics = false;
    }
    // Detect WebM
    else if (extension === '.webm') {
      container = 'WebM Video';
      detectedCodec = 'VP8 / VP9 / AV1';
    }
  } catch (err) {
    console.warn('Binary header probe failed:', err);
  }

  // 2. Client-side HTML5 Video probe to test hardware decodability
  let probedWidth: number | undefined;
  let probedHeight: number | undefined;
  let probedDuration: number | undefined;

  try {
    const probePromise = new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Probe timeout: browser took too long to parse headers'));
      }, 1500);

      const cleanup = () => {
        clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onerror = null;
        URL.revokeObjectURL(objectUrl);
      };

      video.onloadedmetadata = () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const d = video.duration;
        cleanup();
        resolve({ width: w, height: h, duration: d });
      };

      video.onerror = () => {
        cleanup();
        reject(new Error(video.error ? `HTML5 video error code ${video.error.code}` : 'Video decoding error'));
      };
    });

    const meta = await probePromise;
    probedWidth = meta.width;
    probedHeight = meta.height;
    probedDuration = meta.duration;
    isNativelyPlayable = true;
  } catch (probeErr) {
    isNativelyPlayable = false;
    if (warningLevel === 'none') {
      warningLevel = 'error';
      warningTitle = 'Unsupported Video Codec Profile';
      warningMessage = `The browser could not decode this ${extension.toUpperCase() || 'video'} file. The host operating system does not provide a compatible hardware decoder for this codec.`;
    }
  }

  // Standard recommended profile & FFmpeg command
  const suggestedProfile = 'H.264 / AAC MP4 (30/60 fps Constant Frame Rate, YUV 4:2:0)';
  const suggestedFfmpegCmd = `ffmpeg -i "${fileName}" -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -vsync cfr -r 30 -movflags +faststart "${baseName}_converted.mp4"`;

  return {
    fileName,
    extension,
    sizeBytes,
    sizeFormatted,
    mimeType: mimeType || 'video/unknown',
    container,
    detectedCodec,
    isNativelyPlayable,
    isOptimalForKinematics,
    warningLevel,
    warningTitle,
    warningMessage,
    suggestedProfile,
    suggestedFfmpegCmd,
    videoWidth: probedWidth,
    videoHeight: probedHeight,
    duration: probedDuration,
  };
}

/**
 * Extracts the primary video from a Tracker .trz or .zip archive.
 */
export async function extractVideoFromArchive(file: File): Promise<{
  videoFile: File;
  originalArchiveName: string;
  internalPath: string;
}> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  // Search for video files inside the zip
  const videoExts = ['.mp4', '.mov', '.webm', '.avi', '.m4v', '.mkv', '.mpg', '.mpeg', '.3gp', '.gif'];
  const candidates: Array<{ path: string; file: JSZip.JSZipObject }> = [];

  loadedZip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      const lower = relativePath.toLowerCase();
      if (videoExts.some((ext) => lower.endsWith(ext))) {
        candidates.push({ path: relativePath, file: zipEntry });
      }
    }
  });

  if (candidates.length === 0) {
    throw new Error(
      `No video stream found inside ${file.name}. Ensure the .trz or .zip archive contains an MP4, MOV, WebM, or AVI video.`
    );
  }

  // Prefer mp4, mov, webm over older formats if multiple exist
  candidates.sort((a, b) => {
    const extA = a.path.split('.').pop()?.toLowerCase() || '';
    const extB = b.path.split('.').pop()?.toLowerCase() || '';
    const score = (ext: string) => (['mp4', 'mov', 'webm'].includes(ext) ? 2 : 1);
    return score(extB) - score(extA);
  });

  const best = candidates[0];
  const blob = await best.file.async('blob');
  const extractedFileName = best.path.split('/').pop() || 'extracted-video.mp4';
  const cleanVideoFile = new File([blob], extractedFileName, {
    type: blob.type || 'video/mp4',
  });

  return {
    videoFile: cleanVideoFile,
    originalArchiveName: file.name,
    internalPath: best.path,
  };
}
