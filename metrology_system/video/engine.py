"""
VideoEngine: Real-time dual-stream video synchronization engine
Handles ingestion, synchronization, and delivery of frame pairs
"""
import logging
import threading
import queue
import time
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Tuple
import numpy as np
import cv2
from PyQt5.QtCore import QObject, pyqtSignal, pyqtSlot

logger = logging.getLogger(__name__)


@dataclass
class FrameData:
    """Container for frame metadata"""
    frame_index: int
    timestamp: float
    frame: np.ndarray
    stream_id: int  # 0 or 1


class FrameSynchronizer:
    """Synchronizes frames from two streams based on timestamp proximity"""
    
    def __init__(self, max_frame_delay: float = 0.05):
        """
        Initialize frame synchronizer
        
        Args:
            max_frame_delay: Maximum acceptable time difference between frames (seconds)
        """
        self.max_frame_delay = max_frame_delay
        self.stream1_buffer = {}  # frame_index -> FrameData
        self.stream2_buffer = {}
        self.last_sync_index = (-1, -1)
    
    def add_frame(self, frame_data: FrameData):
        """Add frame to appropriate buffer"""
        if frame_data.stream_id == 0:
            self.stream1_buffer[frame_data.frame_index] = frame_data
        else:
            self.stream2_buffer[frame_data.frame_index] = frame_data
    
    def get_synchronized_pair(self) -> Optional[Tuple[FrameData, FrameData]]:
        """
        Get next synchronized pair of frames based on timestamp proximity
        
        Returns:
            Tuple of (frame_stream1, frame_stream2) or None if no sync pair available
        """
        if not self.stream1_buffer or not self.stream2_buffer:
            return None
        
        # Get candidate frames
        indices1 = sorted(self.stream1_buffer.keys())
        indices2 = sorted(self.stream2_buffer.keys())
        
        # Skip already processed frames
        idx1 = next((i for i in indices1 if i > self.last_sync_index[0]), None)
        idx2 = next((i for i in indices2 if i > self.last_sync_index[1]), None)
        
        if idx1 is None or idx2 is None:
            return None
        
        frame1 = self.stream1_buffer[idx1]
        frame2 = self.stream2_buffer[idx2]
        
        # Check timestamp proximity
        time_diff = abs(frame1.timestamp - frame2.timestamp)
        if time_diff <= self.max_frame_delay:
            # Synchronized pair found
            self.last_sync_index = (idx1, idx2)
            
            # Clean old frames from buffers
            for idx in list(self.stream1_buffer.keys()):
                if idx <= idx1:
                    del self.stream1_buffer[idx]
            for idx in list(self.stream2_buffer.keys()):
                if idx <= idx2:
                    del self.stream2_buffer[idx]
            
            return (frame1, frame2)
        
        return None


class StreamReader(threading.Thread):
    """Threaded reader for a single video stream"""
    
    def __init__(self, stream_path: str, stream_id: int, frame_queue: queue.Queue):
        """
        Initialize stream reader thread
        
        Args:
            stream_path: Path to video file or camera index
            stream_id: Stream identifier (0 or 1)
            frame_queue: Thread-safe queue for frame delivery
        """
        super().__init__(daemon=True)
        self.stream_path = stream_path
        self.stream_id = stream_id
        self.frame_queue = frame_queue
        self.running = False
        self.capture = None
        self.frame_count = 0
    
    def run(self):
        """Main thread execution loop"""
        try:
            # Open video stream
            self.capture = cv2.VideoCapture(self.stream_path)
            if not self.capture.isOpened():
                raise RuntimeError(f"Failed to open stream: {self.stream_path}")
            
            fps = self.capture.get(cv2.CAP_PROP_FPS) or 30
            frame_interval = 1.0 / fps
            
            logger.info(f"Stream {self.stream_id} opened: {self.stream_path}, FPS={fps}")
            
            self.running = True
            start_time = time.time()
            
            while self.running:
                ret, frame = self.capture.read()
                if not ret:
                    logger.info(f"Stream {self.stream_id} reached end")
                    break
                
                # Calculate timestamp based on elapsed time
                timestamp = time.time() - start_time
                
                frame_data = FrameData(
                    frame_index=self.frame_count,
                    timestamp=timestamp,
                    frame=frame,
                    stream_id=self.stream_id
                )
                
                try:
                    self.frame_queue.put(frame_data, timeout=1.0)
                    self.frame_count += 1
                except queue.Full:
                    logger.warning(f"Frame queue full for stream {self.stream_id}, dropping frame")
        
        except Exception as e:
            logger.error(f"Stream reader error for stream {self.stream_id}: {e}")
        
        finally:
            self.running = False
            if self.capture:
                self.capture.release()
            logger.info(f"Stream {self.stream_id} reader closed")
    
    def stop(self):
        """Stop the stream reader"""
        self.running = False


class VideoEngine(QObject):
    """
    Main video processing engine
    Manages dual-stream ingestion, synchronization, and frame delivery
    """
    
    # Signals for frame delivery and status
    frame_pair_ready = pyqtSignal(object, object)  # frame1, frame2
    error_occurred = pyqtSignal(str)
    status_changed = pyqtSignal(str)
    
    def __init__(self, queue_size: int = 30):
        """
        Initialize video engine
        
        Args:
            queue_size: Maximum size of frame queue
        """
        super().__init__()
        self.stream1_path = None
        self.stream2_path = None
        self.is_capturing = False
        self.frame_queue = queue.Queue(maxsize=queue_size)
        self.synchronizer = FrameSynchronizer()
        self.reader_threads = []
        self.sync_thread = None
        self.sync_running = False
    
    def set_stream_paths(self, path1: str, path2: str):
        """Set paths for both video streams"""
        if not Path(path1).exists() and not self._is_camera_index(path1):
            self.error_occurred.emit(f"Stream 1 not found: {path1}")
            return
        if not Path(path2).exists() and not self._is_camera_index(path2):
            self.error_occurred.emit(f"Stream 2 not found: {path2}")
            return
        
        self.stream1_path = path1
        self.stream2_path = path2
        logger.info(f"Stream paths set: {path1}, {path2}")
    
    @staticmethod
    def _is_camera_index(path: str) -> bool:
        """Check if path is a camera index (single digit)"""
        try:
            int(path)
            return True
        except ValueError:
            return False
    
    @pyqtSlot()
    def start_capture(self):
        """Start video capture from both streams"""
        if self.is_capturing:
            logger.warning("Capture already in progress")
            return
        
        if not self.stream1_path or not self.stream2_path:
            self.error_occurred.emit("Stream paths not set. Use 'Open Streams' first.")
            return
        
        try:
            self.is_capturing = True
            self.sync_running = True
            
            # Clear buffers
            while not self.frame_queue.empty():
                try:
                    self.frame_queue.get_nowait()
                except queue.Empty:
                    break
            
            self.synchronizer = FrameSynchronizer()
            
            # Start stream reader threads
            reader1 = StreamReader(self.stream1_path, 0, self.frame_queue)
            reader2 = StreamReader(self.stream2_path, 1, self.frame_queue)
            
            reader1.start()
            reader2.start()
            
            self.reader_threads = [reader1, reader2]
            
            # Start synchronization thread
            self.sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
            self.sync_thread.start()
            
            self.status_changed.emit("Capturing from dual streams")
            logger.info("Video capture started")
        
        except Exception as e:
            self.is_capturing = False
            self.sync_running = False
            self.error_occurred.emit(f"Failed to start capture: {e}")
    
    @pyqtSlot()
    def stop_capture(self):
        """Stop video capture"""
        self.is_capturing = False
        self.sync_running = False
        
        # Stop reader threads
        for reader in self.reader_threads:
            reader.stop()
            reader.join(timeout=2.0)
        
        # Stop sync thread
        if self.sync_thread:
            self.sync_thread.join(timeout=2.0)
        
        self.reader_threads = []
        self.sync_thread = None
        
        self.status_changed.emit("Capture stopped")
        logger.info("Video capture stopped")
    
    def _sync_loop(self):
        """Main synchronization loop - runs in separate thread"""
        sync_timeout = 5.0
        last_pair_time = time.time()
        
        while self.sync_running:
            try:
                # Get frame from queue with timeout
                frame_data = self.frame_queue.get(timeout=0.1)
                self.synchronizer.add_frame(frame_data)
                
                # Try to get synchronized pair
                pair = self.synchronizer.get_synchronized_pair()
                if pair:
                    frame1, frame2 = pair
                    # Emit signal on main thread
                    self.frame_pair_ready.emit(frame1.frame, frame2.frame)
                    last_pair_time = time.time()
            
            except queue.Empty:
                # Check if sync timeout exceeded
                if time.time() - last_pair_time > sync_timeout:
                    if self.is_capturing:
                        logger.warning("Frame synchronization timeout")
                        self.status_changed.emit("Warning: Sync timeout")
            
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
                self.error_occurred.emit(f"Synchronization error: {e}")
