"""
DataLogger: Asynchronous CSV data export for 3D trajectory data
Handles buffered disk writes to prevent frame drop latency
"""
import logging
import threading
import queue
import csv
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime
from PyQt5.QtCore import QObject, pyqtSlot

logger = logging.getLogger(__name__)


@dataclass
class TrajectoryPoint:
    """Single 3D trajectory point"""
    frame_id: int
    timestamp: float
    object_id: int
    x: float
    y: float
    z: float


class IOWriter(threading.Thread):
    """Dedicated I/O thread for buffered CSV writes"""
    
    def __init__(self, filepath: str, buffer_size: int = 100):
        """
        Initialize I/O writer thread
        
        Args:
            filepath: Output CSV file path
            buffer_size: Number of points to buffer before writing
        """
        super().__init__(daemon=True)
        self.filepath = filepath
        self.buffer_size = buffer_size
        self.write_queue = queue.Queue()
        self.running = False
        self.points_written = 0
    
    def run(self):
        """Main thread execution loop"""
        buffer = []
        
        try:
            # Create output directory if needed
            Path(self.filepath).parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.filepath, 'w', newline='') as csvfile:
                writer = csv.DictWriter(
                    csvfile,
                    fieldnames=['frame_id', 'timestamp', 'object_id', 'x', 'y', 'z']
                )
                writer.writeheader()
                
                self.running = True
                logger.info(f"CSV writer opened: {self.filepath}")
                
                while self.running or not self.write_queue.empty():
                    try:
                        # Try to get point with timeout
                        point = self.write_queue.get(timeout=1.0)
                        buffer.append(point)
                        
                        # Write buffer when full or timeout
                        if len(buffer) >= self.buffer_size:
                            self._flush_buffer(writer, buffer)
                            buffer = []
                    
                    except queue.Empty:
                        # Periodic flush on timeout
                        if buffer:
                            self._flush_buffer(writer, buffer)
                            buffer = []
                
                # Final flush
                if buffer:
                    self._flush_buffer(writer, buffer)
        
        except Exception as e:
            logger.error(f"CSV writer error: {e}")
        
        finally:
            self.running = False
            logger.info(f"CSV writer closed. Points written: {self.points_written}")
    
    def _flush_buffer(self, writer, buffer: List[TrajectoryPoint]):
        """Write buffered points to CSV"""
        for point in buffer:
            writer.writerow({
                'frame_id': point.frame_id,
                'timestamp': point.timestamp,
                'object_id': point.object_id,
                'x': point.x,
                'y': point.y,
                'z': point.z
            })
        self.points_written += len(buffer)
    
    def add_point(self, point: TrajectoryPoint):
        """Add point to write queue (non-blocking)"""
        try:
            self.write_queue.put(point, block=False)
        except queue.Full:
            logger.warning("Write queue full, dropping point")
    
    def stop(self):
        """Stop the writer thread"""
        self.running = False


class DataLogger(QObject):
    """
    Main data logging system for trajectory data
    Coordinates buffered CSV export via dedicated I/O thread
    """
    
    def __init__(self):
        """Initialize data logger"""
        super().__init__()
        self.io_writer = None
        self.buffer = []
        self.buffer_lock = threading.Lock()
    
    def log_trajectory_point(self, frame_id: int, timestamp: float, 
                            object_id: int, x: float, y: float, z: float):
        """
        Log a single 3D trajectory point (thread-safe)
        
        Args:
            frame_id: Frame index
            timestamp: Frame timestamp in seconds
            object_id: Tracked object identifier
            x, y, z: 3D coordinates
        """
        if self.io_writer is None:
            return
        
        point = TrajectoryPoint(
            frame_id=frame_id,
            timestamp=timestamp,
            object_id=object_id,
            x=x, y=y, z=z
        )
        
        self.io_writer.add_point(point)
    
    def log_trajectory_batch(self, points: List[tuple]):
        """
        Log multiple trajectory points efficiently
        
        Args:
            points: List of tuples (frame_id, timestamp, object_id, x, y, z)
        """
        if self.io_writer is None:
            return
        
        for point_data in points:
            frame_id, timestamp, object_id, x, y, z = point_data
            point = TrajectoryPoint(
                frame_id=frame_id,
                timestamp=timestamp,
                object_id=object_id,
                x=x, y=y, z=z
            )
            self.io_writer.add_point(point)
    
    @pyqtSlot(str)
    def export_to_csv(self, filepath: str):
        """
        Start asynchronous CSV export
        
        Args:
            filepath: Output file path
        """
        # Stop any existing writer
        if self.io_writer:
            self.io_writer.stop()
            self.io_writer.join(timeout=5.0)
        
        # Start new writer
        self.io_writer = IOWriter(filepath, buffer_size=100)
        self.io_writer.start()
        
        logger.info(f"CSV export started: {filepath}")
    
    def flush(self):
        """Flush all pending writes"""
        if self.io_writer:
            self.io_writer.stop()
            self.io_writer.join(timeout=5.0)
            logger.info("Data logger flushed")
    
    def stop(self):
        """Stop logging and close all writers"""
        self.flush()
        self.io_writer = None
        logger.info("Data logger stopped")
