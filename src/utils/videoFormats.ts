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
