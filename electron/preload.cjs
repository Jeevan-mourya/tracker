const { ipcRenderer, contextBridge } = require('electron');

const bridgeApi = {
  isAvailable: true,
  /**
   * Transcodes or decodes any legacy .wmv, .flv, .mov, or compressed .avi file offline
   * using bundled static ffmpeg.exe into an all-intra (-g 1) H.264 CFR MP4 buffer.
   */
  transcodeOrDecodeFile: async (filePathOrBuffer, fileName, onProgress) => {
    const progressHandler = (_event, payload) => {
      if (typeof onProgress === 'function' && payload && payload.fileName === fileName) {
        onProgress(payload.percent ?? 50, payload.statusText || 'Decoding video stream...');
      }
    };

    ipcRenderer.on('transcode-legacy-video-progress', progressHandler);
    try {
      const result = await ipcRenderer.invoke('transcode-legacy-video', {
        filePathOrBuffer,
        fileName,
      });
      return result;
    } finally {
      ipcRenderer.removeListener('transcode-legacy-video-progress', progressHandler);
    }
  },
};

try {
  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('electronVideoBridge', bridgeApi);
  } else {
    window.electronVideoBridge = bridgeApi;
  }
} catch {
  if (typeof window !== 'undefined') {
    window.electronVideoBridge = bridgeApi;
  }
}
